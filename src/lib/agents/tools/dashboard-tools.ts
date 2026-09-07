import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { getDashboardData, getSyncStatus } from "../../dashboard/queries";
import { computeAttentionFlags } from "../../insights/rules";

// Every tool re-reads the same live data the dashboard page itself renders
// (a handful of small queries against five clients) rather than caching —
// simplicity over an optimization this dataset doesn't need, and it
// guarantees the chat agent can never answer from numbers older than what
// a person would see by refreshing the page.

export const getFleetSnapshotTool = tool({
  description:
    "Get this week's (last 7 days) metrics for every active client — leads, leads-vs-prior-week delta, calls (total/missed), " +
    "ad spend, cost per lead, GA4 sessions and conversions, and average search position — plus rule-based attention flags " +
    "(sync errors, stale syncs, leads trending down, a high missed-call rate, or search position drifting worse). " +
    "Call this first for almost any question about how clients are doing.",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date();
    const data = await getDashboardData(now);
    const flags = computeAttentionFlags(data);
    return {
      generatedAt: data.generatedAt.toISOString(),
      clients: data.rows.map((row) => ({
        clientId: row.clientId,
        clientName: row.clientName,
        leads: row.leads,
        leadsDelta: row.leadsDelta,
        calls: row.calls,
        spend: row.spend,
        cpl: row.cpl,
        sessions: row.sessions,
        conversions: row.conversions,
        avgPosition: row.avgPosition,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
        staleHours: row.staleHours,
      })),
      flags,
    };
  },
});

export const getClientDetailTool = tool({
  description:
    "Get the 30-day daily trend and per-platform source breakdown for one client. Requires the clientId — call " +
    "getFleetSnapshot first to look up a client's id by name.",
  inputSchema: z.object({ clientId: z.string().describe("The client's id, as returned by getFleetSnapshot") }),
  execute: async ({ clientId }) => {
    const data = await getDashboardData(new Date());
    const detail = data.details[clientId];
    if (!detail) return { error: `No client found with id "${clientId}"` };
    return detail;
  },
});

export const getSyncStatusTool = tool({
  description:
    "Get connector-level sync health: the most recent sync run and, per platform (Google Ads, Meta, GA4, Search Console, " +
    "GoHighLevel, OpenPhone, Ahrefs, Lead Dashboard), how many recent rows are verified vs. unverified and how many " +
    "fetches errored in the last run.",
  inputSchema: z.object({}),
  execute: async () => getSyncStatus(new Date()),
});
