import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { platformCredentials } from "../db/schema";
import type { Platform } from "./types";

// API keys pasted in Settings → API keys (see platformCredentials in
// db/schema.ts). A mapping's credentialLabel points at one as "db:<id>";
// any other label is still the suffix of an env var, so the keys already
// configured in Vercel keep working unchanged.
const STORED_LABEL_PREFIX = "db:";

export function storedLabel(id: string): string {
  return `${STORED_LABEL_PREFIX}${id}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function storedIdFromLabel(label: string | null | undefined): string | null {
  if (!label?.startsWith(STORED_LABEL_PREFIX)) return null;
  const id = label.slice(STORED_LABEL_PREFIX.length);
  // Checked so a malformed label reads as "no key" instead of a Postgres
  // uuid cast error.
  return UUID_RE.test(id) ? id : null;
}

// CREDENTIALS_ENCRYPTION_KEY if set; otherwise derived from
// SETTINGS_SESSION_SECRET (already required for login), so saving keys
// works with no extra setup. Decryption tries both, so setting a dedicated
// key later doesn't strand keys saved before it — but changing or removing
// whichever one a key was saved under does.
function encryptionKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const dedicated = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (dedicated && dedicated.length >= 16) keys.push(createHash("sha256").update(dedicated).digest());
  const session = process.env.SETTINGS_SESSION_SECRET;
  if (session && session.length >= 16) keys.push(createHash("sha256").update(`civsav-credentials:${session}`).digest());
  if (keys.length === 0) {
    throw new Error("Set CREDENTIALS_ENCRYPTION_KEY (or SETTINGS_SESSION_SECRET) to save API keys.");
  }
  return keys;
}

// "v1:<iv>:<tag>:<ciphertext>", each base64.
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeys()[0], iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unrecognized saved key format.");
  for (const key of encryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
    } catch {
      // Wrong key — try the next one.
    }
  }
  throw new Error("A saved API key can't be decrypted — the encryption secret changed since it was saved. Replace the key in Settings → API keys.");
}

// Migrations here are run by hand (pnpm db:migrate), so the app creates
// this one table itself on first use rather than erroring until someone
// does. Same statements as drizzle/0006_saved_api_keys.sql, which is
// idempotent too, so running the migration afterwards is harmless.
let tableReady: Promise<void> | undefined;

// getDb() is typed as a union of the postgres-js and PGlite drizzle
// databases, and TypeScript can't call overloaded or generic query-builder
// methods (execute, returning(fields), ...) through that union. Both extend
// PgDatabase, so this hands back that single common type instead.
export type CredentialsDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export async function credentialsDb(): Promise<CredentialsDb> {
  const db = (await getDb()) as unknown as CredentialsDb;
  tableReady ??= (async () => {
    await db.execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS "platform_credentials" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "platform" "platform" NOT NULL,
        "name" text NOT NULL,
        "external_id" text,
        "secret_encrypted" text NOT NULL,
        "created_by" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )`),
    );
    await db.execute(
      sql.raw(
        `CREATE UNIQUE INDEX IF NOT EXISTS "platform_credentials_platform_name_idx" ON "platform_credentials" USING btree ("platform","name")`,
      ),
    );
  })().catch((err) => {
    tableReady = undefined;
    throw err;
  });
  await tableReady;
  return db;
}

export interface StoredCredential {
  id: string;
  // What goes in a mapping's credentialLabel.
  label: string;
  name: string;
  externalId: string | null;
  secret: string;
}

export async function listStoredCredentials(platform: Platform): Promise<StoredCredential[]> {
  const db = await credentialsDb();
  const rows = await db
    .select()
    .from(platformCredentials)
    .where(eq(platformCredentials.platform, platform))
    .orderBy(asc(platformCredentials.name));
  return rows.map((row) => ({
    id: row.id,
    label: storedLabel(row.id),
    name: row.name,
    externalId: row.externalId,
    secret: decryptSecret(row.secretEncrypted),
  }));
}

// undefined when the label isn't a stored one, or the key was deleted.
export async function storedSecretForLabel(
  platform: Platform,
  label: string | null | undefined,
): Promise<string | undefined> {
  const id = storedIdFromLabel(label);
  if (!id) return undefined;
  const db = await credentialsDb();
  const [row] = await db
    .select({ secretEncrypted: platformCredentials.secretEncrypted })
    .from(platformCredentials)
    .where(and(eq(platformCredentials.id, id), eq(platformCredentials.platform, platform)))
    .limit(1);
  return row ? decryptSecret(row.secretEncrypted) : undefined;
}
