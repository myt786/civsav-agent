import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { clientPlatformAccounts, clients } from "../db/schema";
import { friendlyError } from "../friendly-error";
import { PLATFORM_LABELS, PLATFORM_ORDER } from "../connectors/platform-labels";
import type { Platform } from "../connectors/types";

export interface AccessReport {
  generatedAt: Date;
  clientCount: number;
  // Connected, but the last check failed — usually access was removed.
  notWorking: { clientName: string; platform: string; reason: string }[];
  // Connected but never checked.
  notChecked: { clientName: string; platform: string }[];
  // Active clients with no account for a platform, grouped by platform.
  notConnected: { platform: string; clients: string[] }[];
}

// Who needs access given or fixed, across every active client. Accounts
// someone switched off ("include in updates" off) are left out on purpose.
export async function buildAccessReport(now: Date = new Date()): Promise<AccessReport> {
  const db = await getDb();
  const [activeClients, mappings] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, excludedPlatforms: clients.excludedPlatforms }).from(clients).where(eq(clients.active, true)).orderBy(asc(clients.name)),
    db.select().from(clientPlatformAccounts),
  ]);

  const byClient = new Map<string, Map<Platform, (typeof mappings)[number]>>();
  for (const m of mappings) {
    const map = byClient.get(m.clientId) ?? new Map();
    map.set(m.platform, m);
    byClient.set(m.clientId, map);
  }

  const report: AccessReport = { generatedAt: now, clientCount: activeClients.length, notWorking: [], notChecked: [], notConnected: [] };
  const missing = new Map<Platform, string[]>();

  for (const client of activeClients) {
    const accounts = byClient.get(client.id) ?? new Map();
    for (const platform of PLATFORM_ORDER) {
      const m = accounts.get(platform);
      // Marked "Not used" for this client — nothing to give access to.
      if (!m && (client.excludedPlatforms ?? []).includes(platform)) continue;
      if (!m) {
        missing.set(platform, [...(missing.get(platform) ?? []), client.name]);
        continue;
      }
      if (!m.active) continue;
      if (!m.verifiedAt) {
        report.notChecked.push({ clientName: client.name, platform: PLATFORM_LABELS[platform] });
      } else if (m.verifiedStatus === "error") {
        report.notWorking.push({
          clientName: client.name,
          platform: PLATFORM_LABELS[platform],
          reason: friendlyError(m.lastError).summary,
        });
      }
    }
  }

  report.notConnected = PLATFORM_ORDER.filter((p) => (missing.get(p)?.length ?? 0) > 0).map((p) => ({
    platform: PLATFORM_LABELS[p],
    clients: missing.get(p)!,
  }));
  return report;
}
