"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db";
import { clients, clientPlatformAccounts } from "@/lib/db/schema";
import { logChange, logChanges } from "@/lib/settings/audit";
import { externalIdSchemas } from "@/lib/settings/validation";
import { connectorRegistry } from "@/lib/connectors/registry";
import { getAllDiscoveredAccounts, type DiscoveredAccounts } from "@/lib/connectors/discovery-cache";
import type { Platform, PlatformAccount, DateRange, ConnectorResult } from "@/lib/connectors/types";
import { runSync } from "@/lib/sync/run";
import { PLATFORM_LABELS } from "@/lib/connectors/platform-labels";
import { format, subDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200, "Name is too long."),
  timezone: z.string().trim().refine(isValidTimezone, "Please pick a timezone from the list."),
  active: z.boolean(),
});

function readClientFormData(formData: FormData) {
  return clientSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    active: formData.get("active") === "true",
  });
}

export interface ClientFormState {
  error?: string;
}

export async function updateClient(
  clientId: string,
  _prevState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const session = await requireSession();
  const parsed = readClientFormData(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Something in the form isn't right — please check it." };

  const db = await getDb();
  const [existing] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!existing) return { error: "Client not found." };

  // Switching an archived client back on also un-archives it, so the two
  // flags can't disagree.
  await db
    .update(clients)
    .set(parsed.data.active ? { ...parsed.data, archivedAt: null } : parsed.data)
    .where(eq(clients.id, clientId));

  await logChanges(db, [
    { userEmail: session.email, clientId, field: "name", oldValue: existing.name, newValue: parsed.data.name },
    {
      userEmail: session.email,
      clientId,
      field: "timezone",
      oldValue: existing.timezone,
      newValue: parsed.data.timezone,
    },
    {
      userEmail: session.email,
      clientId,
      field: "active",
      oldValue: String(existing.active),
      newValue: String(parsed.data.active),
    },
  ]);

  revalidatePath("/settings/clients");
  revalidatePath(`/settings/clients/${clientId}`);
  return {};
}

// Archive: for clients we no longer work with. Hidden from Settings by
// default, and paused (active = false), so every active-only query — the
// dashboard, SEO, Insights, AI summaries, the daily and monthly syncs, the
// digest, "Check all accounts" — leaves them out. Nothing is deleted;
// unarchiveClient brings the client straight back.
export async function archiveClient(clientId: string): Promise<void> {
  const session = await requireSession();
  const db = await getDb();
  const [existing] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!existing || existing.archivedAt) return;

  await db.update(clients).set({ active: false, archivedAt: new Date() }).where(eq(clients.id, clientId));
  await logChanges(db, [
    { userEmail: session.email, clientId, field: "archived", oldValue: "false", newValue: "true" },
    { userEmail: session.email, clientId, field: "active", oldValue: String(existing.active), newValue: "false" },
  ]);

  revalidatePath("/settings/clients");
  revalidatePath(`/settings/clients/${clientId}`);
  revalidatePath("/");
  revalidatePath("/seo");
  revalidatePath("/insights");
}

// Restore an archived client: back to active, numbers collected again from
// the next daily update.
export async function unarchiveClient(clientId: string): Promise<void> {
  const session = await requireSession();
  const db = await getDb();
  const [existing] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!existing || !existing.archivedAt) return;

  await db.update(clients).set({ active: true, archivedAt: null }).where(eq(clients.id, clientId));
  await logChanges(db, [
    { userEmail: session.email, clientId, field: "archived", oldValue: "true", newValue: "false" },
    { userEmail: session.email, clientId, field: "active", oldValue: String(existing.active), newValue: "true" },
  ]);

  revalidatePath("/settings/clients");
  revalidatePath(`/settings/clients/${clientId}`);
  revalidatePath("/");
  revalidatePath("/seo");
  revalidatePath("/insights");
}

// "Resume" in the Settings client list — the counterpart of Pause.
export async function reactivateClient(clientId: string): Promise<void> {
  const session = await requireSession();
  const db = await getDb();
  const [existing] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!existing || existing.active) return;

  await db.update(clients).set({ active: true, archivedAt: null }).where(eq(clients.id, clientId));
  await logChange(db, {
    userEmail: session.email,
    clientId,
    field: "active",
    oldValue: "false",
    newValue: "true",
  });

  revalidatePath("/settings/clients");
  revalidatePath(`/settings/clients/${clientId}`);
}

export async function deactivateClient(clientId: string): Promise<void> {
  const session = await requireSession();
  const db = await getDb();
  const [existing] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!existing || !existing.active) return;

  await db.update(clients).set({ active: false }).where(eq(clients.id, clientId));
  await logChange(db, {
    userEmail: session.email,
    clientId,
    field: "active",
    oldValue: "true",
    newValue: "false",
  });

  revalidatePath("/settings/clients");
  revalidatePath(`/settings/clients/${clientId}`);
}

// Powers both /settings/clients/new (all 8 at once, for smart defaults) and
// the Refresh button on the edit page. Discovery never throws — a platform
// with no credentials configured, or a real API error, still comes back as
// a normal { status: "error" } entry so one bad platform never blocks the
// other seven from rendering.
export async function discoverAllAccounts(forceRefresh = false): Promise<DiscoveredAccounts[]> {
  await requireSession();
  return getAllDiscoveredAccounts({ forceRefresh });
}

export interface MappingFormState {
  error?: string;
  // Set after a successful save — the mapping is checked straight away.
  verify?: VerifyResult;
}

export async function upsertMapping(
  clientId: string,
  platform: Platform,
  _prevState: MappingFormState,
  formData: FormData,
): Promise<MappingFormState> {
  const session = await requireSession();

  const rawExternalId = formData.get("externalId");
  const active = formData.get("active") === "true";
  // Only meaningful for a platform whose credentials are split per-tenant
  // (OpenPhone) — empty string means "the platform's single default
  // credential," normalized to null for storage.
  const rawCredentialLabel = formData.get("credentialLabel");
  const credentialLabel = typeof rawCredentialLabel === "string" && rawCredentialLabel.length > 0 ? rawCredentialLabel : null;

  const idParsed = externalIdSchemas[platform].safeParse(rawExternalId);
  if (!idParsed.success) {
    return { error: idParsed.error.issues[0]?.message ?? "That doesn't look right — please check it." };
  }

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(clientPlatformAccounts)
    .where(and(eq(clientPlatformAccounts.clientId, clientId), eq(clientPlatformAccounts.platform, platform)))
    .limit(1);

  await db
    .insert(clientPlatformAccounts)
    .values({ clientId, platform, externalId: idParsed.data, active, credentialLabel })
    .onConflictDoUpdate({
      target: [clientPlatformAccounts.clientId, clientPlatformAccounts.platform],
      set: { externalId: idParsed.data, active, credentialLabel },
    });

  await logChanges(db, [
    {
      userEmail: session.email,
      clientId,
      platform,
      field: "external_id",
      oldValue: existing?.externalId ?? null,
      newValue: idParsed.data,
    },
    {
      userEmail: session.email,
      clientId,
      platform,
      field: "active",
      oldValue: existing ? String(existing.active) : null,
      newValue: String(active),
    },
    {
      userEmail: session.email,
      clientId,
      platform,
      field: "credential_label",
      oldValue: existing?.credentialLabel ?? null,
      newValue: credentialLabel,
    },
  ]);

  const verify = await runVerification(clientId, platform);
  revalidatePath(`/settings/clients/${clientId}`);
  return { verify };
}

export type VerifyResult =
  | { status: "ok"; figures: Record<string, string> }
  | { status: "no_data" }
  | { status: "error"; message: string };

function summarizeFigures(data: unknown): Record<string, string> {
  if (typeof data !== "object" || data === null) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
      out[key] = String(value);
    }
  }
  return out;
}

// Last 7 full days before today, in the mapping's client's own timezone —
// same anchoring the sync engine and dashboard use, just a wider window
// than a single sync day so a Verify click has enough data to judge.
function last7DayWindow(timezone: string, now: Date): DateRange {
  const yesterday = subDays(toZonedTime(now, timezone), 1);
  const startKey = format(subDays(yesterday, 6), "yyyy-MM-dd");
  const endKey = format(yesterday, "yyyy-MM-dd");
  return {
    start: fromZonedTime(`${startKey}T00:00:00.000`, timezone),
    end: fromZonedTime(`${endKey}T23:59:59.999`, timezone),
  };
}

export async function verifyMapping(clientId: string, platform: Platform): Promise<VerifyResult> {
  await requireSession();
  const result = await runVerification(clientId, platform);
  revalidatePath(`/settings/clients/${clientId}`);
  return result;
}

// Verify every saved mapping for a client at once — the "Check all" button
// on the edit page. Runs in parallel; one platform failing never stops the
// others from being checked.
export async function verifyAllMappings(clientId: string): Promise<{ platform: Platform; result: VerifyResult }[]> {
  await requireSession();
  const db = await getDb();
  const mappings = await db
    .select({ platform: clientPlatformAccounts.platform })
    .from(clientPlatformAccounts)
    .where(eq(clientPlatformAccounts.clientId, clientId));
  const results = await Promise.all(
    mappings.map(async ({ platform }) => ({ platform, result: await runVerification(clientId, platform) })),
  );
  revalidatePath(`/settings/clients/${clientId}`);
  return results;
}

export interface CheckAllAccountsResult {
  checked: number;
  working: number;
  notWorking: number;
  // Accounts not reached before the time budget ran out — clicking again
  // carries on with them.
  remaining: number;
}

// The "Check all accounts" button in Settings: checks every active
// client's accounts that aren't already confirmed working (never checked,
// or last check failed). Already-working accounts are skipped, which keeps
// the run short and avoids spending metered Ahrefs units twice.
export async function checkAllUncheckedAccounts(): Promise<CheckAllAccountsResult> {
  await requireSession();
  const db = await getDb();

  const activeClientIds = new Set(
    (await db.select({ id: clients.id }).from(clients).where(eq(clients.active, true))).map((c) => c.id),
  );
  const mappings = await db
    .select({
      clientId: clientPlatformAccounts.clientId,
      platform: clientPlatformAccounts.platform,
      active: clientPlatformAccounts.active,
      verifiedAt: clientPlatformAccounts.verifiedAt,
      verifiedStatus: clientPlatformAccounts.verifiedStatus,
    })
    .from(clientPlatformAccounts);

  const todo = mappings.filter(
    (m) =>
      m.active &&
      activeClientIds.has(m.clientId) &&
      connectorRegistry[m.platform] &&
      (m.verifiedAt === null || m.verifiedStatus === "error"),
  );

  // The settings page allows 300s; stop starting new checks well before.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 240_000;
  const CONCURRENCY = 6;
  const result: CheckAllAccountsResult = { checked: 0, working: 0, notWorking: 0, remaining: 0 };

  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const mapping = todo[next++];
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        result.remaining++;
        continue;
      }
      const outcome = await runVerification(mapping.clientId, mapping.platform);
      result.checked++;
      if (outcome.status === "error") result.notWorking++;
      else result.working++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, () => worker()));

  revalidatePath("/settings/clients");
  revalidatePath("/");
  return result;
}

// Shared by Verify, Check all, saving a mapping, and creating a client — a
// mapping is checked the moment it's saved, so nobody has to remember a
// separate Verify click before the dashboard trusts its numbers.
async function runVerification(clientId: string, platform: Platform): Promise<VerifyResult> {
  const db = await getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  const [mapping] = await db
    .select()
    .from(clientPlatformAccounts)
    .where(and(eq(clientPlatformAccounts.clientId, clientId), eq(clientPlatformAccounts.platform, platform)))
    .limit(1);

  if (!client || !mapping) {
    return { status: "error", message: "Save this account first, then check it." };
  }

  const connector = connectorRegistry[platform];
  if (!connector) {
    return { status: "error", message: `No connector is registered for ${platform} yet.` };
  }

  const account: PlatformAccount = {
    clientId: client.id,
    clientTimezone: client.timezone,
    platform,
    externalId: mapping.externalId,
    credentialLabel: mapping.credentialLabel,
  };
  const range = last7DayWindow(client.timezone, new Date());

  let result: ConnectorResult<unknown>;
  try {
    result = await connector.fetch(account, range);
  } catch (err) {
    result = { status: "error", error: err instanceof Error ? err.message : String(err) };
  }

  const now = new Date();
  await db
    .update(clientPlatformAccounts)
    .set({
      verifiedAt: now,
      verifiedStatus: result.status,
      lastError: result.status === "error" ? result.error : null,
    })
    .where(eq(clientPlatformAccounts.id, mapping.id));

  if (result.status === "error") return { status: "error", message: result.error };
  if (result.status === "no_data") return { status: "no_data" };
  return { status: "ok", figures: summarizeFigures(result.data) };
}

export interface SyncNowResult {
  status: "completed" | "completed_with_errors" | "failed";
  attempted: number;
  errorCount: number;
}

// The manual trigger next to the sync status strip in /settings/clients —
// calls the same runSync() the Vercel Cron hits (src/app/api/cron/sync/),
// just in-process from a Server Action instead of over HTTP, so it's gated
// by the existing session middleware rather than needing its own auth.
export async function runSyncNow(): Promise<SyncNowResult> {
  await requireSession();
  // Same scope as the daily cron: ahrefs is metered and has its own monthly
  // cadence, so a manual "Update data now" click mustn't spend Ahrefs units.
  const summary = await runSync(new Date(), { excludePlatforms: ["ahrefs"] });
  revalidatePath("/settings/clients");
  revalidatePath("/");
  return { status: summary.status, attempted: summary.attempted, errorCount: summary.errors.length };
}

// One day of the "Fill in missing Search Console days" button. The browser
// calls this once per day (oldest first) so each call stays well inside the
// 300s limit. runSync's `now` is shifted so that day lands as "yesterday";
// the sync then applies Search Console's publishing lag on top.
export async function backfillSearchConsoleDay(daysAgo: number): Promise<SyncNowResult> {
  await requireSession();
  const day = Math.trunc(daysAgo);
  if (!Number.isFinite(day) || day < 1 || day > 90) {
    return { status: "failed", attempted: 0, errorCount: 0 };
  }
  const summary = await runSync(subDays(new Date(), day - 1), { platforms: ["search_console"] });
  return { status: summary.status, attempted: summary.attempted, errorCount: summary.errors.length };
}

export async function finishBackfill(): Promise<void> {
  await requireSession();
  revalidatePath("/settings/clients");
  revalidatePath("/");
  revalidatePath("/seo");
}

export interface NewMappingInput {
  platform: Platform;
  externalId: string;
  active: boolean;
  credentialLabel?: string | null;
}

export interface CreateClientState {
  error?: string;
}

// The single-page /settings/clients/new flow: nothing touches the database
// until this one call, which creates the client, every mapping the user
// filled in (discovered or typed manually), and their audit rows together
// — there's no intermediate "client exists but has no mappings yet" state
// for someone to abandon partway through.
export async function createClientWithMappings(
  name: string,
  timezone: string,
  mappings: NewMappingInput[],
): Promise<CreateClientState> {
  const session = await requireSession();

  const parsedClient = clientSchema.safeParse({ name, timezone, active: true });
  if (!parsedClient.success) {
    return { error: parsedClient.error.issues[0]?.message ?? "Something in the form isn't right — please check it." };
  }

  const parsedMappings: { platform: Platform; externalId: string; active: boolean; credentialLabel: string | null }[] =
    [];
  for (const mapping of mappings) {
    if (mapping.externalId.trim().length === 0) continue;
    const idParsed = externalIdSchemas[mapping.platform].safeParse(mapping.externalId);
    if (!idParsed.success) {
      return { error: `${PLATFORM_LABELS[mapping.platform]}: ${idParsed.error.issues[0]?.message ?? "That doesn't look right."}` };
    }
    parsedMappings.push({
      platform: mapping.platform,
      externalId: idParsed.data,
      active: mapping.active,
      credentialLabel: mapping.credentialLabel ?? null,
    });
  }

  const db = await getDb();
  const [created] = await db.insert(clients).values(parsedClient.data).returning();

  if (parsedMappings.length > 0) {
    await db.insert(clientPlatformAccounts).values(
      parsedMappings.map((mapping) => ({
        clientId: created.id,
        platform: mapping.platform,
        externalId: mapping.externalId,
        active: mapping.active,
        credentialLabel: mapping.credentialLabel,
      })),
    );
  }

  await logChanges(db, [
    { userEmail: session.email, clientId: created.id, field: "name", oldValue: null, newValue: created.name },
    {
      userEmail: session.email,
      clientId: created.id,
      field: "timezone",
      oldValue: null,
      newValue: created.timezone,
    },
    {
      userEmail: session.email,
      clientId: created.id,
      field: "active",
      oldValue: null,
      newValue: String(created.active),
    },
    ...parsedMappings.flatMap((mapping) => [
      {
        userEmail: session.email,
        clientId: created.id,
        platform: mapping.platform,
        field: "external_id",
        oldValue: null,
        newValue: mapping.externalId,
      },
      {
        userEmail: session.email,
        clientId: created.id,
        platform: mapping.platform,
        field: "active",
        oldValue: null,
        newValue: String(mapping.active),
      },
    ]),
  ]);

  // Check every mapping now, so the client page opens with real
  // connected/error results instead of a column of "not verified" badges.
  // allSettled: the client already exists, so a check blowing up must not
  // stop the redirect (and tempt a second submit that duplicates it).
  await Promise.allSettled(parsedMappings.map((mapping) => runVerification(created.id, mapping.platform)));

  revalidatePath("/settings/clients");
  redirect(`/settings/clients/${created.id}`);
}
