"use server";

import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clientPlatformAccounts, clients } from "@/lib/db/schema";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";
import { getDashboardData, getSyncStatus } from "@/lib/dashboard/queries";
import { isSessionActive } from "@/lib/auth/team";
import { computeAttentionFlags } from "@/lib/insights/rules";

export interface NavSummary {
  email: string | null;
  // Clients flagged on Insights (same count as the dashboard card).
  attention: number;
  // Switched-on accounts of live clients whose last check failed.
  brokenAccounts: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  // Removed from Settings → Team, or their password was reset: the shell
  // signs them out.
  ended?: boolean;
}

// The sidebar's badges and footer, loaded after the page so it never slows
// navigation. Every part is best-effort: a failure shows no badge rather
// than breaking the shell.
export async function getNavSummary(): Promise<NavSummary> {
  const summary: NavSummary = { email: null, attention: 0, brokenAccounts: 0, lastRunAt: null, lastRunStatus: null };

  const jar = await cookies();
  const session = await verifySessionCookieValue(jar.get(SETTINGS_SESSION_COOKIE)?.value);
  if (!session) return summary;
  if (!(await isSessionActive(session))) return { ...summary, ended: true };
  summary.email = session.email;

  await Promise.all([
    (async () => {
      try {
        const data = await getDashboardData();
        summary.attention = new Set(computeAttentionFlags(data).map((f) => f.clientId)).size;
      } catch {
        // No badge.
      }
    })(),
    (async () => {
      try {
        const db = await getDb();
        const rows = await db
          .select({ id: clientPlatformAccounts.id })
          .from(clientPlatformAccounts)
          .innerJoin(clients, eq(clients.id, clientPlatformAccounts.clientId))
          .where(
            and(
              eq(clientPlatformAccounts.active, true),
              eq(clientPlatformAccounts.verifiedStatus, "error"),
              eq(clients.active, true),
              isNull(clients.archivedAt),
            ),
          );
        summary.brokenAccounts = rows.length;
      } catch {
        // No badge.
      }
    })(),
    (async () => {
      try {
        const status = await getSyncStatus();
        summary.lastRunAt = status.lastRunAt ? status.lastRunAt.toISOString() : null;
        summary.lastRunStatus = status.lastRunStatus;
      } catch {
        // No footer line.
      }
    })(),
  ]);

  return summary;
}

export interface PaletteClient {
  id: string;
  name: string;
  status: "active" | "paused" | "archived";
}

// Client names for Quick jump (⌘K), loaded when it opens.
export async function getPaletteClients(): Promise<PaletteClient[]> {
  const jar = await cookies();
  const session = await verifySessionCookieValue(jar.get(SETTINGS_SESSION_COOKIE)?.value);
  if (!session) return [];
  try {
    const db = await getDb();
    const rows = await db
      .select({ id: clients.id, name: clients.name, active: clients.active, archivedAt: clients.archivedAt })
      .from(clients)
      .orderBy(clients.name);
    return rows.map<PaletteClient>((c) => ({
      id: c.id,
      name: c.name,
      status: c.archivedAt ? "archived" : c.active ? "active" : "paused",
    }));
  } catch {
    return [];
  }
}
