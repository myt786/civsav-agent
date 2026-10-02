"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db";
import { clientPlatformAccounts, clients, platformCredentials } from "@/lib/db/schema";
import { logChanges } from "@/lib/settings/audit";
import { externalIdSchemas, isUuid } from "@/lib/settings/validation";
import { credentialsDb, encryptSecret, listStoredCredentials, storedLabel } from "@/lib/connectors/stored-credentials";
import { invalidateDiscovery } from "@/lib/connectors/discovery-cache";
import { migrateEnvKeys } from "@/lib/connectors/env-keys";
import { testGhlKey } from "@/lib/connectors/ghl/client";
import { testOpenPhoneKey } from "@/lib/connectors/openphone/client";
import { verifyMapping } from "./actions";

// Settings → API keys: per-client/per-workspace keys for GHL and OpenPhone,
// stored encrypted in platform_credentials instead of one Vercel env var
// (and a redeploy) per key.

export interface CredentialFormState {
  error?: string;
  success?: string;
}

const keyPlatformSchema = z.enum(["ghl", "openphone"]);

async function testKey(
  platform: "ghl" | "openphone",
  apiKey: string,
  locationId: string | null,
): Promise<{ ok: true; note?: string } | { ok: false; error: string }> {
  // Local dev runs against fixtures with no real keys to test.
  if (process.env.CONNECTOR_MODE === "fixture") return { ok: true };
  if (platform === "ghl") return testGhlKey(apiKey, locationId ?? "");
  const result = await testOpenPhoneKey(apiKey);
  if (!result.ok) return result;
  return {
    ok: true,
    note: `${result.numberCount} phone number${result.numberCount === 1 ? "" : "s"} found in this workspace.`,
  };
}

function encrypt(apiKey: string): { ok: true; value: string } | { ok: false; error: string } {
  try {
    return { ok: true, value: encryptSecret(apiKey) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const addSchema = z.object({
  platform: keyPlatformSchema,
  name: z.string().trim().min(1, "Give the key a name, like the client's name.").max(200, "That name is too long."),
  apiKey: z.string().trim().min(8, "Paste the full API key."),
  locationId: z.string().trim().optional(),
  clientId: z.string().uuid().optional(),
});

export async function addPlatformCredential(
  _prevState: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const session = await requireSession();

  const parsed = addSchema.safeParse({
    platform: formData.get("platform"),
    name: formData.get("name"),
    apiKey: formData.get("apiKey"),
    locationId: formData.get("locationId") || undefined,
    clientId: formData.get("clientId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Something in the form isn't right — please check it." };
  const { platform, name, apiKey, clientId } = parsed.data;

  let locationId: string | null = null;
  if (platform === "ghl") {
    const idParsed = externalIdSchemas.ghl.safeParse(parsed.data.locationId ?? "");
    if (!idParsed.success) return { error: idParsed.error.issues[0]?.message ?? "Location ID is required." };
    locationId = idParsed.data;
  }

  const db = await credentialsDb();
  const [existing] = await db
    .select({ id: platformCredentials.id })
    .from(platformCredentials)
    .where(and(eq(platformCredentials.platform, platform), eq(platformCredentials.name, name)))
    .limit(1);
  if (existing) return { error: `You already have a key called "${name}". Use a different name, or use "Replace with a new key" on that one below.` };

  const test = await testKey(platform, apiKey, locationId);
  if (!test.ok) return { error: test.error };

  const encrypted = encrypt(apiKey);
  if (!encrypted.ok) return { error: encrypted.error };

  const [created] = await db
    .insert(platformCredentials)
    .values({ platform, name, externalId: locationId, secretEncrypted: encrypted.value, createdBy: session.email })
    .returning();

  invalidateDiscovery(platform);
  revalidatePath("/settings/api-keys");

  if (clientId) {
    const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
    if (client && platform === "ghl" && locationId) {
      // A GHL key belongs to exactly one location, so when it was added
      // from a client's page there's nothing left to pick — map it now.
      await connectGhlMapping(session.email, client.id, locationId, storedLabel(created.id));
      await verifyMapping(client.id, "ghl");
    }
    if (client) {
      revalidatePath(`/settings/clients/${client.id}`);
      redirect(`/settings/clients/${client.id}`);
    }
  }

  return { success: `Saved "${name}". ${test.note ?? ""}`.trim() };
}

async function connectGhlMapping(userEmail: string, clientId: string, locationId: string, credentialLabel: string) {
  const db = await getDb();
  const [previous] = await db
    .select()
    .from(clientPlatformAccounts)
    .where(and(eq(clientPlatformAccounts.clientId, clientId), eq(clientPlatformAccounts.platform, "ghl")))
    .limit(1);

  await db
    .insert(clientPlatformAccounts)
    .values({ clientId, platform: "ghl", externalId: locationId, active: true, credentialLabel })
    .onConflictDoUpdate({
      target: [clientPlatformAccounts.clientId, clientPlatformAccounts.platform],
      set: { externalId: locationId, active: true, credentialLabel },
    });

  await logChanges(db, [
    {
      userEmail,
      clientId,
      platform: "ghl",
      field: "external_id",
      oldValue: previous?.externalId ?? null,
      newValue: locationId,
    },
    {
      userEmail,
      clientId,
      platform: "ghl",
      field: "credential_label",
      oldValue: previous?.credentialLabel ?? null,
      newValue: credentialLabel,
    },
  ]);
}

// Swap in a new key value (e.g. after regenerating it in GHL/OpenPhone)
// without touching the mappings that use it.
export async function replacePlatformCredential(
  credentialId: string,
  _prevState: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  await requireSession();
  if (!isUuid(credentialId)) return { error: "That key no longer exists." };

  const apiKey = z.string().trim().min(8, "Paste the full API key.").safeParse(formData.get("apiKey"));
  if (!apiKey.success) return { error: apiKey.error.issues[0]?.message ?? "Please paste the full key." };

  const db = await credentialsDb();
  const [row] = await db.select().from(platformCredentials).where(eq(platformCredentials.id, credentialId)).limit(1);
  if (!row) return { error: "That key no longer exists." };
  const platform = keyPlatformSchema.safeParse(row.platform);
  if (!platform.success) return { error: "Unsupported platform." };

  const test = await testKey(platform.data, apiKey.data, row.externalId);
  if (!test.ok) return { error: test.error };

  const encrypted = encrypt(apiKey.data);
  if (!encrypted.ok) return { error: encrypted.error };

  await db
    .update(platformCredentials)
    .set({ secretEncrypted: encrypted.value, updatedAt: new Date() })
    .where(eq(platformCredentials.id, credentialId));

  invalidateDiscovery(platform.data);
  revalidatePath("/settings/api-keys");
  return { success: "Key replaced." };
}

export async function deletePlatformCredential(
  credentialId: string,
  _prevState: CredentialFormState,
): Promise<CredentialFormState> {
  await requireSession();
  if (!isUuid(credentialId)) return {};

  const db = await credentialsDb();
  const [row] = await db.select().from(platformCredentials).where(eq(platformCredentials.id, credentialId)).limit(1);
  if (!row) return {};

  // Deleting a key a client still syncs with would silently break that
  // client's numbers — make someone re-point those clients first.
  const inUse = await db
    .select({ name: clients.name })
    .from(clientPlatformAccounts)
    .innerJoin(clients, eq(clients.id, clientPlatformAccounts.clientId))
    .where(eq(clientPlatformAccounts.credentialLabel, storedLabel(row.id)));
  if (inUse.length > 0) {
    return { error: `Still used by ${inUse.map((c) => c.name).join(", ")}. Change their mapping first.` };
  }

  await db.delete(platformCredentials).where(eq(platformCredentials.id, credentialId));
  if (row.platform === "ghl" || row.platform === "openphone") invalidateDiscovery(row.platform);
  revalidatePath("/settings/api-keys");
  return {};
}

export interface MoveEnvKeysResult {
  ok: boolean;
  message: string;
}

// "Move them into saved keys" on Settings → API keys: copies the keys a
// developer set up as Vercel env vars into the app (encrypted, like a
// pasted key) and points their clients at the saved copies. Nothing to
// paste — the values are read on the server and never sent to the browser.
export async function moveEnvKeysToSaved(): Promise<MoveEnvKeysResult> {
  const session = await requireSession();
  try {
    const result = await migrateEnvKeys(session.email);
    if (result.repointed.length > 0) {
      const db = await getDb();
      await logChanges(
        db,
        result.repointed.map((r) => ({
          userEmail: session.email,
          clientId: r.clientId,
          platform: r.platform,
          field: "credential_label",
          oldValue: r.from,
          newValue: r.to,
        })),
      );
    }
    invalidateDiscovery("ghl");
    invalidateDiscovery("openphone");
    revalidatePath("/settings/api-keys");
    revalidatePath("/settings/clients");

    const parts = [
      result.moved > 0 ? `Moved ${result.moved} key${result.moved === 1 ? "" : "s"}` : "No new keys to move",
      result.clientsRepointed > 0 ? `${result.clientsRepointed} client account${result.clientsRepointed === 1 ? "" : "s"} now use the saved copies` : null,
      result.needLocation > 0
        ? `${result.needLocation} GoHighLevel key${result.needLocation === 1 ? " needs its" : "s need their"} sub-account ID — add it on the key below`
        : null,
    ].filter(Boolean);
    return { ok: true, message: `${parts.join(". ")}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't move the keys." };
  }
}

// Sets the sub-account (location) ID on a saved GoHighLevel key — a
// sub-account key only works for its own location, so a key moved in
// without one can't be used until it's added. Tested before saving.
export async function setGhlKeyLocation(
  credentialId: string,
  _prevState: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  await requireSession();
  if (!isUuid(credentialId)) return { error: "That key no longer exists." };
  const idParsed = externalIdSchemas.ghl.safeParse(formData.get("locationId") ?? "");
  if (!idParsed.success) return { error: idParsed.error.issues[0]?.message ?? "Enter the sub-account ID." };

  const db = await credentialsDb();
  const [row] = await db.select().from(platformCredentials).where(eq(platformCredentials.id, credentialId)).limit(1);
  if (!row || row.platform !== "ghl") return { error: "That key no longer exists." };

  const secret = (await listStoredCredentials("ghl")).find((c) => c.id === row.id)?.secret;
  if (!secret) return { error: "That key can't be read — replace it with a new key." };
  const test = await testKey("ghl", secret, idParsed.data);
  if (!test.ok) return { error: test.error };

  await db
    .update(platformCredentials)
    .set({ externalId: idParsed.data, updatedAt: new Date() })
    .where(eq(platformCredentials.id, credentialId));
  invalidateDiscovery("ghl");
  revalidatePath("/settings/api-keys");
  return { success: "Sub-account ID saved — this key now shows up when connecting a client." };
}
