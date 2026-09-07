// Signed-cookie session for /settings, built on Web Crypto (globalThis.crypto)
// instead of node:crypto so the exact same code runs in both the Node.js
// server-action runtime and the Edge middleware runtime — no node:crypto
// import here, deliberately.

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h

export const SETTINGS_SESSION_COOKIE = "settings_session";

interface SessionPayload {
  email: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.SETTINGS_SESSION_SECRET;
  if (!secret) {
    throw new Error("SETTINGS_SESSION_SECRET is not set — required to sign the settings login session.");
  }
  return secret;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function createSessionCookieValue(email: string): Promise<string> {
  const key = await getKey();
  const payload: SessionPayload = { email, exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionCookieValue(value: string | undefined | null): Promise<{ email: string } | null> {
  if (!value) return null;
  const [payloadB64, signatureB64] = value.split(".");
  if (!payloadB64 || !signatureB64) return null;

  const key = await getKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signatureB64),
    new TextEncoder().encode(payloadB64),
  );
  if (!valid) return null;

  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as SessionPayload).email !== "string" ||
      typeof (payload as SessionPayload).exp !== "number"
    ) {
      return null;
    }
    const { email, exp } = payload as SessionPayload;
    if (Date.now() > exp) return null;
    return { email };
  } catch {
    return null;
  }
}
