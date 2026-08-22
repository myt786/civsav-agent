import "server-only";
import { connectorRegistry } from "./registry";
import type { DiscoveryResult, Platform } from "./types";
import { PLATFORM_ORDER } from "./platform-labels";

const TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  result: DiscoveryResult;
  fetchedAt: Date;
}

// Module-scope cache: this app runs as a single Node process (PGlite-backed
// locally, a normal long-lived server otherwise), so there's no need for a
// DB-backed or distributed cache just to avoid hitting eight platform APIs
// on every settings page load.
const cache = new Map<Platform, CacheEntry>();

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
  const isFresh = cached && Date.now() - cached.fetchedAt.getTime() < TTL_MS;
  if (cached && isFresh && !forceRefresh) {
    return { platform, result: cached.result, cachedAt: cached.fetchedAt };
  }

  const connector = connectorRegistry[platform];
  const result: DiscoveryResult = connector?.listAccounts
    ? await connector.listAccounts()
    : { status: "error", error: `Account discovery isn't available for this platform yet.` };

  const fetchedAt = new Date();
  cache.set(platform, { result, fetchedAt });
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
