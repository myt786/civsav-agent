import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { getDb } from "../db";
import { clientPlatformAccounts, clientSeoMonthly, clientSeoRecommendations, clients, metricSnapshots } from "../db/schema";
import { searchConsoleDataSchema } from "../connectors/search-console/schema";
import { seoDataSchema } from "../connectors/ahrefs/schema";
import { average, buildNumericCell, downgradeIfUnverifiedMapping } from "../dashboard/metrics";
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

// Shared by getSeoDashboardData (batch, all clients) and
// getSeoClientSnapshot (one client) — same row-building logic either way,
// just fed maps scoped to however many clients the caller queried for.
function buildClientRow(
  client: { id: string; name: string },
  months: string[],
  prevMonth: string,
  newestMonth: string,
  scByMonth: Map<string, SnapshotRow[]>,
  ahrefsRow: { metrics: unknown } | undefined,
  seoMonthlyByMonth: Map<string, { seoOwner: string | null; status: string | null; notes: string | null }>,
  searchConsoleVerified: boolean,
  ahrefsVerified: boolean,
): { row: SeoClientRow; rm: ReturnType<typeof computeRowMetrics> } {
  const monthCells: SeoMonthCell[] = months.map((month) => {
    const monthRows = scByMonth.get(month) ?? [];
    return {
      month,
      clicks: downgradeIfUnverifiedMapping(
        buildNumericCell(monthRows, searchConsoleDataSchema, (d) => d.totalClicks, null),
        searchConsoleVerified,
      ),
      impressions: downgradeIfUnverifiedMapping(
        buildNumericCell(monthRows, searchConsoleDataSchema, (d) => d.totalImpressions, null),
        searchConsoleVerified,
      ),
      avgPosition: downgradeIfUnverifiedMapping(
        buildNumericCell(monthRows, searchConsoleDataSchema, (d) => d.averagePosition, null, average),
        searchConsoleVerified,
      ),
    };
  });

  const clicksByMonth = monthCells.map((m) => cellValue(m.clicks));
  const rm = computeRowMetrics([clicksByMonth[0], clicksByMonth[1], clicksByMonth[2]]);

  const ahrefsParsed = ahrefsRow ? seoDataSchema.safeParse(ahrefsRow.metrics) : null;
  const ahrefsOk = ahrefsParsed?.success ? ahrefsParsed.data : null;

  const ahrefsCell = <T>(extract: (d: NonNullable<typeof ahrefsOk>) => T): CellState<T> =>
    downgradeIfUnverifiedMapping(ahrefsOk ? { kind: "ok", value: extract(ahrefsOk) } : { kind: "no_data" }, ahrefsVerified);

  const currentMonthly = seoMonthlyByMonth.get(newestMonth) ?? null;
  const prevMonthly = seoMonthlyByMonth.get(prevMonth) ?? null;

  const row: SeoClientRow = {
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
    referringDomains: downgradeIfUnverifiedMapping(
      ahrefsOk?.referringDomains != null ? { kind: "ok", value: ahrefsOk.referringDomains } : { kind: "no_data" },
      ahrefsVerified,
    ),
    newReferringDomains: ahrefsOk?.newReferringDomains ?? null,
    seoOwner: currentMonthly?.seoOwner ?? null,
    status: currentMonthly?.status ?? null,
    notes: currentMonthly?.notes ?? null,
    prevMonthSummary: prevMonthly?.notes ?? null,
  };

  return { row, rm };
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

  const [searchConsoleRows, ahrefsRows, seoMonthlyRows, mappingRows] = await Promise.all([
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
    db.select().from(clientPlatformAccounts).where(inArray(clientPlatformAccounts.clientId, clientIds)),
  ]);

  // A mapping the settings UI has never run Verify against has its
  // numbers downgraded to unverified regardless of the per-day
  // reconciliation flag — same discipline as the main dashboard (see
  // isMappingVerified in dashboard/queries.ts). Freshly-added mappings
  // (the 58 clients just onboarded from seo-ai-tool's roster) start out
  // unverified until someone clicks Verify at /settings/clients/[id].
  const mappingVerifiedSet = new Set(
    mappingRows.filter((m) => m.verifiedAt !== null).map((m) => `${m.clientId}:${m.platform}`),
  );
  const isMappingVerified = (clientId: string, platform: "search_console" | "ahrefs") =>
    mappingVerifiedSet.has(`${clientId}:${platform}`);

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
    const { row, rm } = buildClientRow(
      client,
      months,
      prevMonth,
      newestMonth,
      scByClientMonth.get(client.id) ?? new Map(),
      latestAhrefsByClient.get(client.id),
      seoMonthlyByClientMonth.get(client.id) ?? new Map(),
      isMappingVerified(client.id, "search_console"),
      isMappingVerified(client.id, "ahrefs"),
    );
    rowMetricsList.push(rm);
    rows.push(row);
  }

  const aggregates = computePortfolioAggregates(
    rowMetricsList,
    rows.map((r) => r.newReferringDomains),
  );

  return { generatedAt: now, months, rows, aggregates };
}

// A small, single-client query — for the Recommendations feature, which
// generates one client at a time (including in a "generate all" batch
// loop) and would otherwise be recomputing all ~60 clients' data on every
// single call if it reused getSeoDashboardData.
export async function getSeoClientSnapshot(clientId: string, now: Date = new Date()): Promise<SeoClientRow | null> {
  const db = await getDb();
  const months = trailingCompleteMonths(now, MONTHS_SHOWN);
  const [oldestMonth, , newestMonth] = months;
  const prevMonth = months[months.length - 2];

  const windowStart = format(startOfMonth(new Date(`${oldestMonth}-01`)), "yyyy-MM-dd");
  const windowEnd = format(endOfMonth(new Date(`${newestMonth}-01`)), "yyyy-MM-dd");

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;

  const [searchConsoleRows, ahrefsRows, seoMonthlyRows, mappingRows] = await Promise.all([
    db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.clientId, clientId),
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
          eq(metricSnapshots.clientId, clientId),
          eq(metricSnapshots.platform, "ahrefs"),
          gte(metricSnapshots.date, windowStart),
          lte(metricSnapshots.date, windowEnd),
        ),
      )
      .orderBy(desc(metricSnapshots.date)),
    db.select().from(clientSeoMonthly).where(eq(clientSeoMonthly.clientId, clientId)),
    db.select().from(clientPlatformAccounts).where(eq(clientPlatformAccounts.clientId, clientId)),
  ]);

  const scByMonth = new Map<string, SnapshotRow[]>();
  for (const row of searchConsoleRows) {
    const list = scByMonth.get(monthOf(row.date)) ?? [];
    list.push({ date: row.date, verified: row.verified, metrics: row.metrics });
    scByMonth.set(monthOf(row.date), list);
  }

  const seoMonthlyByMonth = new Map(seoMonthlyRows.map((r) => [r.month, r]));
  const isVerified = (platform: "search_console" | "ahrefs") =>
    mappingRows.some((m) => m.platform === platform && m.verifiedAt !== null);

  const { row } = buildClientRow(
    client,
    months,
    prevMonth,
    newestMonth,
    scByMonth,
    ahrefsRows[0], // sorted newest-first
    seoMonthlyByMonth,
    isVerified("search_console"),
    isVerified("ahrefs"),
  );

  return row;
}

export interface SeoRecommendationRow {
  clientId: string;
  clientName: string;
  tier: SeoClientRow["tier"];
  recommendations: string[] | null;
  sitemapUrlCount: number | null;
  generatedAt: Date | null;
}

// Joins already-fetched portfolio rows with their latest cached
// recommendation (if any) — takes `rows` rather than calling
// getSeoDashboardData itself so a page that needs both the portfolio
// table and this doesn't fetch the dashboard data twice. Instant either
// way, since generation itself (sitemap fetch + a deeper GSC pull + an
// LLM call) never runs on page load, only on demand.
export async function getSeoRecommendations(rows: SeoClientRow[]): Promise<SeoRecommendationRow[]> {
  const db = await getDb();
  const clientIds = rows.map((r) => r.clientId);
  const cached = clientIds.length
    ? await db.select().from(clientSeoRecommendations).where(inArray(clientSeoRecommendations.clientId, clientIds))
    : [];
  const cachedByClient = new Map(cached.map((c) => [c.clientId, c]));

  return rows.map((row) => {
    const c = cachedByClient.get(row.clientId);
    return {
      clientId: row.clientId,
      clientName: row.clientName,
      tier: row.tier,
      recommendations: (c?.recommendations as string[] | undefined) ?? null,
      sitemapUrlCount: c?.sitemapUrlCount ?? null,
      generatedAt: c?.generatedAt ?? null,
    };
  });
}

// All of a client's monthly Notes, oldest -> newest — "history of what
// was done," for the Recommendations feature. Separate from the
// dashboard-facing prevMonthSummary (which only ever needs one prior
// month) since this wants the full record.
export async function getSeoNotesHistory(clientId: string): Promise<{ month: string; notes: string }[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(clientSeoMonthly)
    .where(eq(clientSeoMonthly.clientId, clientId))
    .orderBy(clientSeoMonthly.month);
  return rows.filter((r) => r.notes).map((r) => ({ month: r.month, notes: r.notes! }));
}
