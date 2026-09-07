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
  timezone: z.string().trim().refine(isValidTimezone, "Not a recognized IANA timezone."),
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
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const db = await getDb();
  const [existing] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!existing) return { error: "Client not found." };

  await db.update(clients).set(parsed.data).where(eq(clients.id, clientId));

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
    return { error: idParsed.error.issues[0]?.message ?? "Invalid value." };
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

  revalidatePath(`/settings/clients/${clientId}`);
  return {};
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

  const db = await getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  const [mapping] = await db
    .select()
    .from(clientPlatformAccounts)
    .where(and(eq(clientPlatformAccounts.clientId, clientId), eq(clientPlatformAccounts.platform, platform)))
    .limit(1);

  if (!client || !mapping) {
    return { status: "error", message: "Save the mapping before verifying it." };
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

  revalidatePath(`/settings/clients/${clientId}`);

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
  const summary = await runSync();
  revalidatePath("/settings/clients");
  revalidatePath("/");
  return { status: summary.status, attempted: summary.attempted, errorCount: summary.errors.length };
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
    return { error: parsedClient.error.issues[0]?.message ?? "Invalid input." };
  }

  const parsedMappings: { platform: Platform; externalId: string; active: boolean; credentialLabel: string | null }[] =
    [];
  for (const mapping of mappings) {
    if (mapping.externalId.trim().length === 0) continue;
    const idParsed = externalIdSchemas[mapping.platform].safeParse(mapping.externalId);
    if (!idParsed.success) {
      return { error: `${mapping.platform}: ${idParsed.error.issues[0]?.message ?? "Invalid value."}` };
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

  revalidatePath("/settings/clients");
  redirect(`/settings/clients/${created.id}`);
}
