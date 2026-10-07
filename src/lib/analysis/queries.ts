import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { clientAnalyses, clients } from "../db/schema";
import type { AnalysisKind, AnalysisListEntry, AnalysisRow, StoredAnalysis } from "./types";
import { allRecommendations } from "./format";

function toRow(row: typeof clientAnalyses.$inferSelect): AnalysisRow {
  return {
    id: row.id,
    clientId: row.clientId,
    kind: row.kind as AnalysisKind,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    generatedAt: row.generatedAt.toISOString(),
    createdBy: row.createdBy,
    report: row.report as StoredAnalysis,
  };
}

export async function listClientAnalyses(clientId: string): Promise<AnalysisListEntry[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: clientAnalyses.id,
      kind: clientAnalyses.kind,
      periodStart: clientAnalyses.periodStart,
      periodEnd: clientAnalyses.periodEnd,
      generatedAt: clientAnalyses.generatedAt,
      healthScore: clientAnalyses.healthScore,
    })
    .from(clientAnalyses)
    .where(eq(clientAnalyses.clientId, clientId))
    .orderBy(desc(clientAnalyses.generatedAt))
    .limit(36);
  return rows.map<AnalysisListEntry>((r) => ({
    id: r.id,
    kind: r.kind as AnalysisKind,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    generatedAt: r.generatedAt.toISOString(),
    healthScore: r.healthScore,
  }));
}

export async function getAnalysis(id: string): Promise<AnalysisRow | null> {
  const db = await getDb();
  const rows = await db.select().from(clientAnalyses).where(eq(clientAnalyses.id, id)).limit(1);
  return rows[0] ? toRow(rows[0]) : null;
}

export interface ClientHealthEntry {
  analysisId: string;
  clientId: string;
  clientName: string;
  healthScore: number;
  headline: string;
  periodLabel: string;
  generatedAt: string;
  openHigh: number;
  openTotal: number;
  // Open recommendations, highest priority first (up to 3).
  topActions: { title: string; priority: string; platform: string }[];
}

// The latest report for every live client, weakest first — the Insights
// "Client health" list and the monthly email both read this.
export async function getLatestClientHealth(): Promise<ClientHealthEntry[]> {
  const db = await getDb();
  // Newest first; the first row seen per client is its latest report.
  const all = await db
    .select({
      id: clientAnalyses.id,
      clientId: clientAnalyses.clientId,
      clientName: clients.name,
      healthScore: clientAnalyses.healthScore,
      report: clientAnalyses.report,
      generatedAt: clientAnalyses.generatedAt,
    })
    .from(clientAnalyses)
    .innerJoin(clients, eq(clients.id, clientAnalyses.clientId))
    .where(sql`${clients.active} = true and ${clients.archivedAt} is null`)
    .orderBy(desc(clientAnalyses.generatedAt));
  const seen = new Set<string>();
  const rows = all.filter((r) => (seen.has(r.clientId) ? false : (seen.add(r.clientId), true)));

  return rows
    .map<ClientHealthEntry>((r) => {
      const report = r.report as StoredAnalysis;
      const recs = allRecommendations(report)
        .map((x) => ({ ...x, platform: x.area }))
        .filter((x) => x.status === "open");
      const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const topActions = [...recs]
        .sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3))
        .slice(0, 3)
        .map((x) => ({ title: x.title, priority: x.priority, platform: x.platform }));
      return {
        analysisId: r.id,
        clientId: r.clientId,
        clientName: r.clientName,
        healthScore: r.healthScore,
        headline: report.headline ?? "",
        periodLabel: report.facts?.period?.label ?? "",
        generatedAt: r.generatedAt.toISOString(),
        openHigh: recs.filter((x) => x.priority === "high").length,
        openTotal: recs.length,
        topActions,
      };
    })
    .sort((a, b) => a.healthScore - b.healthScore);
}

export async function latestGeneratedAt(clientId: string, kind?: AnalysisKind): Promise<Date | null> {
  const db = await getDb();
  const rows = await db
    .select({ generatedAt: clientAnalyses.generatedAt, kind: clientAnalyses.kind })
    .from(clientAnalyses)
    .where(eq(clientAnalyses.clientId, clientId))
    .orderBy(desc(clientAnalyses.generatedAt))
    .limit(10);
  const match = rows.find((r) => !kind || r.kind === kind);
  return match ? match.generatedAt : null;
}

export async function listLiveClients(): Promise<{ id: string; name: string }[]> {
  const db = await getDb();
  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(sql`${clients.active} = true and ${clients.archivedAt} is null`)
    .orderBy(clients.name);
}
