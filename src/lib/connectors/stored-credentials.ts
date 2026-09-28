import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
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

function encryptionKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set (needs 16+ characters) — saved API keys can't be read.");
  }
  // Hashing lets the env var be any long random string rather than exactly
  // 32 bytes of base64.
  return createHash("sha256").update(raw).digest();
}

// "v1:<iv>:<tag>:<ciphertext>", each base64.
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unrecognized saved key format.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
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
  const db = await getDb();
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
  const db = await getDb();
  const [row] = await db
    .select({ secretEncrypted: platformCredentials.secretEncrypted })
    .from(platformCredentials)
    .where(and(eq(platformCredentials.id, id), eq(platformCredentials.platform, platform)))
    .limit(1);
  return row ? decryptSecret(row.secretEncrypted) : undefined;
}
