import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { platformCredentials } from "../../db/schema";
import { credentialsDb, encryptSecret } from "../stored-credentials";
import { invalidateDiscovery } from "../discovery-cache";
import { listAccountsForLogin, listManagerAccounts, oauthClient } from "./client";

// "Connect Google Ads" in Settings → API keys: a team member signs in with
// Google, and the refresh token that comes back is saved (encrypted) as one
// more Google Ads login — no OAuth Playground, no Vercel env var, no
// redeploy. Uses the same OAuth client as the main login, whose Google
// Cloud settings must list callbackUrl() as an authorised redirect URI.

export const OAUTH_COOKIE = "gads_oauth";
const SCOPES = ["https://www.googleapis.com/auth/adwords", "openid", "email"];

export function callbackUrl(origin: string): string {
  return process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI || `${origin}/api/google-ads/callback`;
}

export interface PendingConnect {
  state: string;
  name: string;
  managerId: string;
  createdBy: string;
}

export function managerDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function formatManagerId(digits: string | null | undefined): string | null {
  const d = managerDigits(digits);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : null;
}

export function startConnect(
  origin: string,
  input: { name: string; managerId: string; createdBy: string },
): { ok: true; url: string; pending: PendingConnect } | { ok: false; error: string } {
  const oauth = oauthClient();
  if (!oauth) return { ok: false, error: "Google Ads isn't set up in this app yet (GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET)." };
  const managerId = managerDigits(input.managerId);
  if (managerId !== "" && managerId.length !== 10) {
    return { ok: false, error: "A manager account ID has 10 digits, like 123-456-7890." };
  }

  const pending: PendingConnect = {
    state: randomBytes(24).toString("hex"),
    name: input.name.trim().slice(0, 200),
    managerId,
    createdBy: input.createdBy,
  };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", oauth.clientId);
  url.searchParams.set("redirect_uri", callbackUrl(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  // offline + consent: Google only returns a refresh token on a fresh
  // consent, and without one there's nothing to save.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", pending.state);
  return { ok: true, url: url.toString(), pending };
}

function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    // Straight from Google's token endpoint over TLS, so the signature
    // doesn't need checking just to read who signed in.
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export type ConnectOutcome =
  | { ok: true; name: string; accountCount: number; managerId: string | null; replaced: boolean }
  | { ok: false; error: string };

export async function finishConnect(origin: string, code: string, pending: PendingConnect): Promise<ConnectOutcome> {
  const oauth = oauthClient();
  if (!oauth) return { ok: false, error: "Google Ads isn't set up in this app yet." };

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
    }),
  });
  const tokens = (await response.json().catch(() => ({}))) as { refresh_token?: unknown; id_token?: unknown; error_description?: unknown };
  if (!response.ok) {
    return { ok: false, error: `Google didn't accept the sign-in: ${typeof tokens.error_description === "string" ? tokens.error_description : response.status}.` };
  }
  if (typeof tokens.refresh_token !== "string" || tokens.refresh_token === "") {
    return {
      ok: false,
      error: "Google didn't return a long-lived token. Remove this app at myaccount.google.com/permissions, then connect again.",
    };
  }
  const refreshToken = tokens.refresh_token;
  const email = emailFromIdToken(tokens.id_token);

  // No manager ID typed: use the one manager account this user can open,
  // if there's exactly one. Otherwise read their accounts directly.
  let managerId = pending.managerId;
  if (!managerId) {
    try {
      const managers = await listManagerAccounts(oauth, refreshToken);
      if (managers.length === 1) managerId = managerDigits(managers[0].id);
    } catch {
      // Fall back to direct access; the account listing below says if that fails too.
    }
  }

  // Proves the login can actually read ad accounts before it's saved.
  const listed = await listAccountsForLogin(oauth, { refreshToken, loginCustomerId: managerId || undefined });
  if (listed.status === "error") return { ok: false, error: listed.error };

  const name = pending.name || email || "Google Ads login";
  const db = await credentialsDb();
  // Reconnecting under the same name replaces that login's token, so
  // clients already using it keep working.
  const [existing] = await db
    .select({ id: platformCredentials.id })
    .from(platformCredentials)
    .where(and(eq(platformCredentials.platform, "google_ads"), eq(platformCredentials.name, name)))
    .limit(1);
  const secretEncrypted = encryptSecret(refreshToken);
  if (existing) {
    await db
      .update(platformCredentials)
      .set({ secretEncrypted, externalId: managerId || null, updatedAt: new Date() })
      .where(eq(platformCredentials.id, existing.id));
  } else {
    await db.insert(platformCredentials).values({
      platform: "google_ads",
      name,
      externalId: managerId || null,
      secretEncrypted,
      createdBy: pending.createdBy,
    });
  }
  invalidateDiscovery("google_ads");

  return { ok: true, name, accountCount: listed.accounts.length, managerId: formatManagerId(managerId), replaced: Boolean(existing) };
}
