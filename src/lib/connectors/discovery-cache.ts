import "server-only";
import { connectorRegistry } from "./registry";
import type { DiscoveryResult, Platform } from "./types";
import { PLATFORM_ORDER } from "./platform-labels";
import { sql } from "drizzle-orm";
import { platformCredentials } from "../db/schema";
import { credentialsDb } from "./stored-credentials";

const TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  result: DiscoveryResult;
  fetchedAt: Date;
  // Fingerprint of the platform's saved keys/logins when this was fetched.
  credentialsStamp: string;
}

// Platforms whose accounts depend on keys/logins saved in Settings → API keys.
const STORED_CREDENTIAL_PLATFORMS = new Set<Platform>(["ghl", "openphone", "google_ads"]);

// Vercel runs several server instances, each with its own copy of this
// cache, and invalidateDiscovery() only clears the one that saved the key.
// So the others notice instead: a key added, replaced or removed changes
// this count/last-updated fingerprint, and the cached list is refetched.
async function credentialsStampFor(platform: Platform): Promise<string> {
  if (!STORED_CREDENTIAL_PLATFORMS.has(platform)) return "";
  try {
    const db = await credentialsDb();
    const [row] = await db
      .select({
        count: sql<number>`count(*)`,
        latest: sql<string | null>`max(${platformCredentials.updatedAt})`,
      })
      .from(platformCredentials)
      .where(sql`${platformCredentials.platform} = ${platform}`);
    return `${row?.count ?? 0}:${row?.latest ?? ""}`;
  } catch {
    return "";
  }
}

// Module-scope cache: this app runs as a single Node process (PGlite-backed
// locally, a normal long-lived server otherwise), so there's no need for a
// DB-backed or distributed cache just to avoid hitting eight platform APIs
// on every settings page load.
const cache = new Map<Platform, CacheEntry>();

// Called after an API key is added, replaced or deleted in Settings, so the
// account list reflects it right away instead of after the TTL.
export function invalidateDiscovery(platform: Platform): void {
  cache.delete(platform);
}

// Platform APIs don't always fill every field (an unnamed Google Ads
// account, a GHL location without a name), and the Settings pages call
// string methods on these while rendering — one missing name took down a
// whole client page. Everything leaving here has a string id and name.
function cleanResult(result: DiscoveryResult): DiscoveryResult {
  if (result.status !== "ok" || !Array.isArray(result.accounts)) {
    return result.status === "ok" ? { status: "ok", accounts: [] } : result;
  }
  return {
    status: "ok",
    accounts: result.accounts
      .filter((account) => account && typeof account === "object")
      .map((account) => {
        const id = account.id === null || account.id === undefined ? "" : String(account.id);
        const name = typeof account.name === "string" && account.name.trim() !== "" ? account.name : id;
        return {
          ...account,
          id,
          name,
          extra: typeof account.extra === "string" ? account.extra : undefined,
        };
      }),
  };
}

export interface DiscoveredAccounts {
  platform: Platform;
  result: DiscoveryResult;
  cachedAt: Date;
}

export async function getDiscoveredAccounts(
  platform: Platform,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<DiscoveredAccounts> {
  const cached = cache.get(platform);
  const credentialsStamp = await credentialsStampFor(platform);
  const isFresh =
    cached && Date.now() - cached.fetchedAt.getTime() < TTL_MS && cached.credentialsStamp === credentialsStamp;
  if (cached && isFresh && !forceRefresh) {
    return { platform, result: cached.result, cachedAt: cached.fetchedAt };
  }

  const connector = connectorRegistry[platform];
  const result: DiscoveryResult = connector?.listAccounts
    ? cleanResult(await connector.listAccounts())
    : { status: "error", error: `Account discovery isn't available for this platform yet.` };

  const fetchedAt = new Date();
  cache.set(platform, { result, fetchedAt, credentialsStamp });
  return { platform, result, cachedAt: fetchedAt };
}

// One platform's discovery failing (missing credentials, API outage) must
// never block the other seven from loading — Promise.allSettled would be
// redundant here since getDiscoveredAccounts already never rejects, but the
// per-platform try/catch keeps that guarantee explicit rather than assumed.
export async function getAllDiscoveredAccounts(
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<DiscoveredAccounts[]> {
  return Promise.all(
    PLATFORM_ORDER.map(async (platform) => {
      try {
        return await getDiscoveredAccounts(platform, { forceRefresh });
      } catch (err) {
        return {
          platform,
          result: { status: "error" as const, error: err instanceof Error ? err.message : String(err) },
          cachedAt: new Date(),
        };
      }
    }),
  );
}
