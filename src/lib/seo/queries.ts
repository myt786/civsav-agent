import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { getDb } from "../db";
import { clientSeoMonthly, clients, metricSnapshots } from "../db/schema";
import { searchConsoleDataSchema } from "../connectors/search-console/schema";
import { seoDataSchema } from "../connectors/ahrefs/schema";
import { average, buildNumericCell } from "../dashboard/metrics";
import type { SnapshotRow } from "../dashboard/metrics";
import type { CellState } from "../dashboard/types";
import { computePortfolioAggregates, computeRowMetrics } from "./compute";
import { MONTHS_SHOWN } from "./constants";
import type { SeoClientRow, SeoDashboardData, SeoMonthCell } from "./types";

// The last MONTHS_SHOWN complete calendar months, oldest -> newest,
// excluding the current (still in-progress) month — same idea as
// last_n_complete_months() in the Python puller, simplified to whole
// months only (no day-of-month lag buffer: a client with no data for a
// day or two at month's edge just shows a slightly lower count, not a
// wrong one).
function trailingCompleteMonths(now: Date, count: number): string[] {
  const months: string[] = [];
  for (let i = count; i >= 1; i--) {
    months.push(format(subMonths(now, i), "yyyy-MM"));
  }
  return months;
}

function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function cellValue(cell: CellState<number>): number | null {
  return cell.kind === "ok" || cell.kind === "unverified" ? cell.value : null;
}

export async function getSeoDashboardData(now: Date = new Date()): Promise<SeoDashboardData> {
  const db = await getDb();
  const months = trailingCompleteMonths(now, MONTHS_SHOWN);
  const [oldestMonth, , newestMonth] = months;
  const prevMonth = months[months.length - 2];

  const windowStart = format(startOfMonth(new Date(`${oldestMonth}-01`)), "yyyy-MM-dd");
  const windowEnd = format(endOfMonth(new Date(`${newestMonth}-01`)), "yyyy-MM-dd");

  const activeClients = await db.select().from(clients).where(eq(clients.active, true)).orderBy(clients.name);
  const clientIds = activeClients.map((c) => c.id);

  if (clientIds.length === 0) {
    return {
      generatedAt: now,
      months,
      rows: [],
      aggregates: { tierCounts: { strong: 0, moderate: 0, small: 0, minimal: 0, no_data: 0 }, portfolioMomPct: null, portfolio3moPct: null, newReferringDomainsSum: 0 },
    };
  }

  const [searchConsoleRows, ahrefsRows, seoMonthlyRows] = await Promise.all([
    db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          inArray(metricSnapshots.clientId, clientIds),
          eq(metricSnapshots.platform, "search_console"),
          gte(metricSnapshots.date, windowStart),
          lte(metricSnapshots.date, windowEnd),
        ),
      ),
    db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          inArray(metricSnapshots.clientId, clientIds),
          eq(metricSnapshots.platform, "ahrefs"),
          gte(metricSnapshots.date, windowStart),
          lte(metricSnapshots.date, windowEnd),
        ),
      )
      .orderBy(desc(metricSnapshots.date)),
    db.select().from(clientSeoMonthly).where(inArray(clientSeoMonthly.clientId, clientIds)),
  ]);

  const scByClientMonth = new Map<string, Map<string, SnapshotRow[]>>();
  for (const row of searchConsoleRows) {
    const byMonth = scByClientMonth.get(row.clientId) ?? new Map<string, SnapshotRow[]>();
    const list = byMonth.get(monthOf(row.date)) ?? [];
    list.push({ date: row.date, verified: row.verified, metrics: row.metrics });
    byMonth.set(monthOf(row.date), list);
    scByClientMonth.set(row.clientId, byMonth);
  }

  // ahrefsRows is sorted newest-date-first — the first row seen per
  // client is its latest snapshot in the window.
  const latestAhrefsByClient = new Map<string, (typeof ahrefsRows)[number]>();
  for (const row of ahrefsRows) {
    if (!latestAhrefsByClient.has(row.clientId)) latestAhrefsByClient.set(row.clientId, row);
  }

  const seoMonthlyByClientMonth = new Map<string, Map<string, (typeof seoMonthlyRows)[number]>>();
  for (const row of seoMonthlyRows) {
    const byMonth = seoMonthlyByClientMonth.get(row.clientId) ?? new Map();
    byMonth.set(row.month, row);
    seoMonthlyByClientMonth.set(row.clientId, byMonth);
  }

  const rows: SeoClientRow[] = [];
  const rowMetricsList: ReturnType<typeof computeRowMetrics>[] = [];

  for (const client of activeClients) {
    const monthCells: SeoMonthCell[] = months.map((month) => {
      const monthRows = scByClientMonth.get(client.id)?.get(month) ?? [];
      return {
        month,
        clicks: buildNumericCell(monthRows, searchConsoleDataSchema, (d) => d.totalClicks, null),
        impressions: buildNumericCell(monthRows, searchConsoleDataSchema, (d) => d.totalImpressions, null),
        avgPosition: buildNumericCell(monthRows, searchConsoleDataSchema, (d) => d.averagePosition, null, average),
      };
    });

    const clicksByMonth = monthCells.map((m) => cellValue(m.clicks));
    const rm = computeRowMetrics([clicksByMonth[0], clicksByMonth[1], clicksByMonth[2]]);
    rowMetricsList.push(rm);

    const ahrefsRow = latestAhrefsByClient.get(client.id);
    const ahrefsParsed = ahrefsRow ? seoDataSchema.safeParse(ahrefsRow.metrics) : null;
    const ahrefsOk = ahrefsParsed?.success ? ahrefsParsed.data : null;

    const ahrefsCell = <T>(extract: (d: NonNullable<typeof ahrefsOk>) => T): CellState<T> =>
      ahrefsOk ? { kind: "ok", value: extract(ahrefsOk) } : { kind: "no_data" };

    const seoMonthly = seoMonthlyByClientMonth.get(client.id);
    const currentMonthly = seoMonthly?.get(newestMonth) ?? null;
    const prevMonthly = seoMonthly?.get(prevMonth) ?? null;

    rows.push({
      clientId: client.id,
      clientName: client.name,
      months: monthCells,
      tier: rm.tier,
      trend: rm.trend,
      momPct: rm.momPct,
      avg3: rm.avg3,
      organicKeywords: ahrefsCell((d) => d.organicKeywords),
      organicKeywordsTop3: ahrefsCell((d) => d.organicKeywordsTop3),
      keywordsGained: ahrefsCell((d) => d.keywordsGained),
      keywordsLost: ahrefsCell((d) => d.keywordsLost),
      referringDomains: ahrefsOk?.referringDomains != null ? { kind: "ok", value: ahrefsOk.referringDomains } : { kind: "no_data" },
      newReferringDomains: ahrefsOk?.newReferringDomains ?? null,
      seoOwner: currentMonthly?.seoOwner ?? null,
      status: currentMonthly?.status ?? null,
      notes: currentMonthly?.notes ?? null,
      prevMonthSummary: prevMonthly?.notes ?? null,
    });
  }

  const aggregates = computePortfolioAggregates(
    rowMetricsList,
    rows.map((r) => r.newReferringDomains),
  );

  return { generatedAt: now, months, rows, aggregates };
}
