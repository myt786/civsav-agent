import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { clientPlatformAccounts, clients, platformCredentials } from "../db/schema";
import { credentialsDb, encryptSecret, listStoredCredentials, storedLabel } from "./stored-credentials";

// GHL and OpenPhone keys that were configured as Vercel env vars before
// Settings → API keys existed. Everything here runs on the server only —
// key values never leave it.
export interface EnvKey {
  platform: "ghl" | "openphone";
  // The env-var suffix a mapping's credentialLabel points at; null for the
  // single OPENPHONE_API_KEY (mappings with no label use it).
  label: string | null;
  value: string;
}

const PREFIXES = { ghl: "GHL_AGENCY_API_KEY__", openphone: "OPENPHONE_API_KEY__" } as const;

export function listEnvKeys(): EnvKey[] {
  const keys: EnvKey[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!value) continue;
    for (const platform of ["ghl", "openphone"] as const) {
      if (name.startsWith(PREFIXES[platform])) keys.push({ platform, label: name.slice(PREFIXES[platform].length), value });
    }
  }
  if (process.env.OPENPHONE_API_KEY) keys.push({ platform: "openphone", label: null, value: process.env.OPENPHONE_API_KEY });
  return keys;
}

export function humanizeLabel(label: string): string {
  return label
    .toLowerCase()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

async function storedSecrets(platform: "ghl" | "openphone"): Promise<Map<string, string>> {
  // secret -> stored label. A key that can't be decrypted just doesn't match.
  try {
    return new Map((await listStoredCredentials(platform)).map((c) => [c.secret, c.label]));
  } catch {
    return new Map();
  }
}

// How many env keys per platform aren't saved in the app yet.
export async function countUnsavedEnvKeys(): Promise<{ ghl: number; openphone: number; total: { ghl: number; openphone: number } }> {
  const env = listEnvKeys();
  const [ghl, openphone] = await Promise.all([storedSecrets("ghl"), storedSecrets("openphone")]);
  const saved = { ghl, openphone };
  const count = (platform: "ghl" | "openphone") => env.filter((k) => k.platform === platform && !saved[platform].has(k.value)).length;
  return {
    ghl: count("ghl"),
    openphone: count("openphone"),
    total: {
      ghl: env.filter((k) => k.platform === "ghl").length,
      openphone: env.filter((k) => k.platform === "openphone").length,
    },
  };
}

export interface MigrationResult {
  moved: number;
  alreadySaved: number;
  // GHL env keys no client uses: their location is unknown (env vars never
  // recorded it), so they're left where they are.
  skippedUnused: number;
  clientsRepointed: number;
  repointed: { clientId: string; platform: "ghl" | "openphone"; from: string | null; to: string }[];
}

// Copies every env-var key into platform_credentials (encrypted, same as a
// pasted key) and points the clients using it at the saved copy. Safe to
// run again: a key already saved is matched by value and only the
// re-pointing is redone. The env vars themselves can't be removed from
// here — once this has run, they can be deleted in Vercel.
export async function migrateEnvKeys(userEmail: string): Promise<MigrationResult> {
  const db = await credentialsDb();
  const result: MigrationResult = { moved: 0, alreadySaved: 0, skippedUnused: 0, clientsRepointed: 0, repointed: [] };
  const secrets = { ghl: await storedSecrets("ghl"), openphone: await storedSecrets("openphone") };

  for (const key of listEnvKeys()) {
    const users = await db
      .select({
        mappingId: clientPlatformAccounts.id,
        clientId: clientPlatformAccounts.clientId,
        externalId: clientPlatformAccounts.externalId,
        clientName: clients.name,
      })
      .from(clientPlatformAccounts)
      .innerJoin(clients, eq(clients.id, clientPlatformAccounts.clientId))
      .where(
        and(
          eq(clientPlatformAccounts.platform, key.platform),
          key.label === null ? isNull(clientPlatformAccounts.credentialLabel) : eq(clientPlatformAccounts.credentialLabel, key.label),
        ),
      );

    let label = secrets[key.platform].get(key.value);
    if (label) {
      result.alreadySaved++;
    } else {
      if (key.platform === "ghl" && users.length === 0) {
        result.skippedUnused++;
        continue;
      }
      const baseName =
        key.platform === "ghl"
          ? (users[0]?.clientName ?? humanizeLabel(key.label ?? "GoHighLevel"))
          : key.label
            ? humanizeLabel(key.label)
            : "Main OpenPhone workspace";
      // (platform, name) is unique — fall back to the env label, then a number.
      const existingNames = new Set(
        (
          await db
            .select({ name: platformCredentials.name })
            .from(platformCredentials)
            .where(eq(platformCredentials.platform, key.platform))
        ).map((r) => r.name),
      );
      let name = baseName;
      if (existingNames.has(name) && key.label) name = `${baseName} (${humanizeLabel(key.label)})`;
      for (let n = 2; existingNames.has(name); n++) name = `${baseName} ${n}`;

      const [created] = await db
        .insert(platformCredentials)
        .values({
          platform: key.platform,
          name,
          externalId: key.platform === "ghl" ? (users[0]?.externalId ?? null) : null,
          secretEncrypted: encryptSecret(key.value),
          createdBy: userEmail,
        })
        .returning();
      label = storedLabel(created.id);
      secrets[key.platform].set(key.value, label);
      result.moved++;
    }

    for (const user of users) {
      await db.update(clientPlatformAccounts).set({ credentialLabel: label }).where(eq(clientPlatformAccounts.id, user.mappingId));
      result.repointed.push({ clientId: user.clientId, platform: key.platform, from: key.label, to: label });
    }
  }

  result.clientsRepointed = result.repointed.length;
  return result;
}
