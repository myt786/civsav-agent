import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { differenceInHours, format, subDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { getDb } from "../db";
import { clientPlatformAccounts, clients, metricSnapshots, rawResponses, syncRuns } from "../db/schema";
import type { Platform } from "../connectors/types";
import { leadDashboardDataSchema } from "../connectors/lead-dashboard/schema";
import { telephonyDataSchema } from "../connectors/openphone/schema";
import { googleAdsDataSchema } from "../connectors/google-ads/schema";
import { metaDataSchema } from "../connectors/meta/schema";
import { ga4DataSchema } from "../connectors/ga4/schema";
import { searchConsoleDataSchema } from "../connectors/search-console/schema";
import { PLATFORM_ORDER, SPARKLINE_DAYS, WINDOW_DAYS } from "./constants";
import {
  average,
  buildCallsCell,
  buildNumericCell,
  computeDelta,
  divideCells,
  downgradeIfUnverifiedMapping,
  isErrorPayload,
  sumCells,
} from "./metrics";
import type { SnapshotRow } from "./metrics";
import type {
  ClientDetail,
  ClientRow,
  ConnectorStatus,
  DailyPoint,
  DashboardData,
  SourceBreakdownItem,
  SparklineMetric,
} from "./types";

// "Yesterday" and back, in the CLIENT's own timezone — the same anchoring
// sync/run.ts uses to decide what date a fetch's numbers belong to. count
// days, starting `startOffset` days back, returned oldest-first.
function dateKeysBack(timezone: string, now: Date, count: number, startOffset: number): string[] {
  const start = subDays(toZonedTime(now, timezone), startOffset);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(format(subDays(start, i), "yyyy-MM-dd"));
  }
  return keys;
}

function groupSnapshots(
  rows: (typeof metricSnapshots.$inferSelect)[],
): Map<string, Map<Platform, SnapshotRow[]>> {
  const byClient = new Map<string, Map<Platform, SnapshotRow[]>>();
  for (const row of rows) {
    let byPlatform = byClient.get(row.clientId);
    if (!byPlatform) {
      byPlatform = new Map();
      byClient.set(row.clientId, byPlatform);
    }
    const list = byPlatform.get(row.platform) ?? [];
    list.push({ date: row.date, verified: row.verified, metrics: row.metrics });
    byPlatform.set(row.platform, list);
  }
  for (const byPlatform of byClient.values()) {
    for (const list of byPlatform.values()) {
      list.sort((a, b) => a.date.localeCompare(b.date));
    }
  }
  return byClient;
}

// Most recent raw_responses row per (client, platform) — `rows` must
// already be sorted newest-first, so the first row seen per key wins.
function latestAttemptByClientPlatform(
  rows: (typeof rawResponses.$inferSelect)[],
): Map<string, { fetchedAt: Date; payload: unknown }> {
  const latest = new Map<string, { fetchedAt: Date; payload: unknown }>();
  for (const row of rows) {
    const key = `${row.clientId}:${row.platform}`;
    if (!latest.has(key)) {
      latest.set(key, { fetchedAt: row.fetchedAt, payload: row.payload });
    }
  }
  return latest;
}

function rowsFor(
  byClient: Map<string, Map<Platform, SnapshotRow[]>>,
  clientId: string,
  platform: Platform,
  dateKeys: string[],
): SnapshotRow[] {
  const all = byClient.get(clientId)?.get(platform) ?? [];
  const wanted = new Set(dateKeys);
  return all.filter((r) => wanted.has(r.date));
}

function attemptErrorFor(
  latest: Map<string, { fetchedAt: Date; payload: unknown }>,
  clientId: string,
  platform: Platform,
): string | null {
  const entry = latest.get(`${clientId}:${platform}`);
  if (!entry || !isErrorPayload(entry.payload)) return null;
  return entry.payload.error;
}

function toSeries(rows: SnapshotRow[], dateKeys: string[], extract: (metrics: unknown) => number | null): DailyPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dateKeys.map((date) => {
    const row = byDate.get(date);
    if (!row) return { date, value: null };
    return { date, value: extract(row.metrics) };
  });
}

function safeExtract<TData>(schema: { safeParse: (v: unknown) => { success: boolean; data?: TData } }, metrics: unknown, extract: (data: TData) => number): number | null {
  const parsed = schema.safeParse(metrics);
  if (!parsed.success || parsed.data === undefined) return null;
  return extract(parsed.data);
}

export async function getDashboardData(now: Date = new Date()): Promise<DashboardData> {
  const db = await getDb();

  const activeClients = await db.select().from(clients).where(eq(clients.active, true)).orderBy(clients.name);
  const clientIds = activeClients.map((c) => c.id);

  // A generous buffer beyond SPARKLINE_DAYS covers timezone drift at the
  // window edges without materially widening the query on a dataset this
  // small (five clients, a handful of platforms each).
  const fetchSince = subDays(now, SPARKLINE_DAYS + 3);
  const fetchSinceKey = format(fetchSince, "yyyy-MM-dd");

  const [snapshotRows, rawRows, mappingRows, latestRunRows] = clientIds.length
    ? await Promise.all([
        db
          .select()
          .from(metricSnapshots)
          .where(and(inArray(metricSnapshots.clientId, clientIds), gte(metricSnapshots.date, fetchSinceKey))),
        db
          .select()
          .from(rawResponses)
          .where(and(inArray(rawResponses.clientId, clientIds), gte(rawResponses.fetchedAt, fetchSince)))
          .orderBy(desc(rawResponses.fetchedAt)),
        db.select().from(clientPlatformAccounts).where(inArray(clientPlatformAccounts.clientId, clientIds)),
        db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1),
      ])
    : [[], [], [], []];

  const snapshotsByClient = groupSnapshots(snapshotRows);
  const latestAttempt = latestAttemptByClientPlatform(rawRows);

  // A mapping the settings UI has never run Verify against — its
  // verifiedAt is null regardless of how much data has synced for it.
  const mappingVerifiedSet = new Set(
    mappingRows.filter((m) => m.verifiedAt !== null).map((m) => `${m.clientId}:${m.platform}`),
  );
  const isMappingVerified = (clientId: string, platform: Platform) =>
    mappingVerifiedSet.has(`${clientId}:${platform}`);

  const rows: ClientRow[] = [];
  const details: Record<string, ClientDetail> = {};

  for (const client of activeClients) {
    const tz = client.timezone;
    const current7 = dateKeysBack(tz, now, WINDOW_DAYS, 1);
    const prev7 = dateKeysBack(tz, now, WINDOW_DAYS, 1 + WINDOW_DAYS);
    const sparkline30 = dateKeysBack(tz, now, SPARKLINE_DAYS, 1);

    const leadsVerified = isMappingVerified(client.id, "lead_dashboard");
    const leadsRows = rowsFor(snapshotsByClient, client.id, "lead_dashboard", current7);
    const leadsPrevRows = rowsFor(snapshotsByClient, client.id, "lead_dashboard", prev7);
    const leadsErr = attemptErrorFor(latestAttempt, client.id, "lead_dashboard");
    const leads = downgradeIfUnverifiedMapping(
      buildNumericCell(leadsRows, leadDashboardDataSchema, (d) => d.totalLeads, leadsErr),
      leadsVerified,
    );
    const leadsPrev = downgradeIfUnverifiedMapping(
      buildNumericCell(leadsPrevRows, leadDashboardDataSchema, (d) => d.totalLeads, leadsErr),
      leadsVerified,
    );
    const leadsDelta = computeDelta(leads, leadsPrev);

    const callsVerified = isMappingVerified(client.id, "openphone");
    const callsRows = rowsFor(snapshotsByClient, client.id, "openphone", current7);
    const callsErr = attemptErrorFor(latestAttempt, client.id, "openphone");
    const calls = downgradeIfUnverifiedMapping(buildCallsCell(callsRows, telephonyDataSchema, callsErr), callsVerified);
    const callsTotal = downgradeIfUnverifiedMapping(
      buildNumericCell(callsRows, telephonyDataSchema, (d) => d.totalCalls, callsErr),
      callsVerified,
    );

    const googleAdsRows = rowsFor(snapshotsByClient, client.id, "google_ads", current7);
    const googleAdsErr = attemptErrorFor(latestAttempt, client.id, "google_ads");
    const googleAdsSpend = downgradeIfUnverifiedMapping(
      buildNumericCell(googleAdsRows, googleAdsDataSchema, (d) => d.cost, googleAdsErr),
      isMappingVerified(client.id, "google_ads"),
    );

    const metaRows = rowsFor(snapshotsByClient, client.id, "meta", current7);
    const metaErr = attemptErrorFor(latestAttempt, client.id, "meta");
    const metaSpend = downgradeIfUnverifiedMapping(
      buildNumericCell(metaRows, metaDataSchema, (d) => d.spend, metaErr),
      isMappingVerified(client.id, "meta"),
    );

    const spend = sumCells([googleAdsSpend, metaSpend]);
    const cpl = divideCells(spend, leads);

    const ga4Verified = isMappingVerified(client.id, "ga4");
    const ga4Rows = rowsFor(snapshotsByClient, client.id, "ga4", current7);
    const ga4Err = attemptErrorFor(latestAttempt, client.id, "ga4");
    const sessions = downgradeIfUnverifiedMapping(
      buildNumericCell(ga4Rows, ga4DataSchema, (d) => d.totalSessions, ga4Err),
      ga4Verified,
    );
    const conversions = downgradeIfUnverifiedMapping(
      buildNumericCell(ga4Rows, ga4DataSchema, (d) => d.totalConversions, ga4Err),
      ga4Verified,
    );

    const searchConsoleRows = rowsFor(snapshotsByClient, client.id, "search_console", current7);
    const searchConsoleErr = attemptErrorFor(latestAttempt, client.id, "search_console");
    const avgPosition = downgradeIfUnverifiedMapping(
      buildNumericCell(searchConsoleRows, searchConsoleDataSchema, (d) => d.averagePosition, searchConsoleErr, average),
      isMappingVerified(client.id, "search_console"),
    );

    const allRawForClient = rawRows.filter((r) => r.clientId === client.id);
    const lastSyncedAt =
      allRawForClient.length > 0
        ? allRawForClient.reduce((max, r) => (r.fetchedAt > max ? r.fetchedAt : max), allRawForClient[0].fetchedAt)
        : null;
    const staleHours = lastSyncedAt ? differenceInHours(now, lastSyncedAt) : null;

    rows.push({
      clientId: client.id,
      clientName: client.name,
      leads,
      leadsDelta,
      calls,
      spend,
      cpl,
      sessions,
      conversions,
      avgPosition,
      lastSyncedAt,
      staleHours,
    });

    const sparklines: SparklineMetric[] = [
      {
        key: "leads",
        label: "Leads",
        points: toSeries(rowsFor(snapshotsByClient, client.id, "lead_dashboard", sparkline30), sparkline30, (m) =>
          safeExtract(leadDashboardDataSchema, m, (d) => d.totalLeads),
        ),
      },
      {
        key: "callsTotal",
        label: "Calls",
        points: toSeries(rowsFor(snapshotsByClient, client.id, "openphone", sparkline30), sparkline30, (m) =>
          safeExtract(telephonyDataSchema, m, (d) => d.totalCalls),
        ),
      },
      {
        key: "callsMissed",
        label: "Missed calls",
        points: toSeries(rowsFor(snapshotsByClient, client.id, "openphone", sparkline30), sparkline30, (m) =>
          safeExtract(telephonyDataSchema, m, (d) => d.missedCalls - d.missedAndForwardedCalls),
        ),
      },
      {
        key: "spend",
        label: "Spend",
        points: sparkline30.map((date) => {
          const gRows = rowsFor(snapshotsByClient, client.id, "google_ads", [date]);
          const mRows = rowsFor(snapshotsByClient, client.id, "meta", [date]);
          if (gRows.length === 0 && mRows.length === 0) return { date, value: null };
          const g = gRows.length ? safeExtract(googleAdsDataSchema, gRows[0].metrics, (d) => d.cost) : 0;
          const m = mRows.length ? safeExtract(metaDataSchema, mRows[0].metrics, (d) => d.spend) : 0;
          return { date, value: (g ?? 0) + (m ?? 0) };
        }),
      },
      {
        key: "sessions",
        label: "Sessions",
        points: toSeries(rowsFor(snapshotsByClient, client.id, "ga4", sparkline30), sparkline30, (m) =>
          safeExtract(ga4DataSchema, m, (d) => d.totalSessions),
        ),
      },
      {
        key: "conversions",
        label: "Conversions",
        points: toSeries(rowsFor(snapshotsByClient, client.id, "ga4", sparkline30), sparkline30, (m) =>
          safeExtract(ga4DataSchema, m, (d) => d.totalConversions),
        ),
      },
      {
        key: "avgPosition",
        label: "Avg. position",
        points: toSeries(rowsFor(snapshotsByClient, client.id, "search_console", sparkline30), sparkline30, (m) =>
          safeExtract(searchConsoleDataSchema, m, (d) => d.averagePosition),
        ),
      },
    ];

    const breakdown: SourceBreakdownItem[] = [
      { platform: "lead_dashboard", label: "Leads", unit: "count", cell: leads },
      { platform: "openphone", label: "Calls", unit: "count", cell: callsTotal },
      { platform: "google_ads", label: "Google Ads spend", unit: "currency", cell: googleAdsSpend },
      { platform: "meta", label: "Meta spend", unit: "currency", cell: metaSpend },
      { platform: "ga4", label: "Sessions", unit: "count", cell: sessions },
      { platform: "ga4", label: "Conversions", unit: "count", cell: conversions },
      { platform: "search_console", label: "Avg. position", unit: "position", cell: avgPosition },
    ];

    details[client.id] = { clientId: client.id, sparklines, breakdown };
  }

  const syncStatus = await getSyncStatusStrip(db, now, latestRunRows[0] ?? null);

  return { generatedAt: now, syncStatus, rows, details };
}

async function getSyncStatusStrip(
  db: Awaited<ReturnType<typeof getDb>>,
  now: Date,
  latestRun: (typeof syncRuns.$inferSelect) | null,
): Promise<DashboardData["syncStatus"]> {
  const lastSyncRows = await db
    .select({ platform: metricSnapshots.platform, lastSync: sql<string | null>`max(${metricSnapshots.createdAt})` })
    .from(metricSnapshots)
    .groupBy(metricSnapshots.platform);

  const verifiedSinceKey = format(subDays(now, WINDOW_DAYS + 1), "yyyy-MM-dd");
  const verifiedRows = await db
    .select({
      platform: metricSnapshots.platform,
      verified: metricSnapshots.verified,
      count: sql<string | number>`count(*)`,
    })
    .from(metricSnapshots)
    .where(gte(metricSnapshots.date, verifiedSinceKey))
    .groupBy(metricSnapshots.platform, metricSnapshots.verified);

  const errorsInLastRun = latestRun
    ? await db.select().from(rawResponses).where(eq(rawResponses.syncRunId, latestRun.id))
    : [];

  const lastSyncByPlatform = new Map<Platform, Date | null>();
  for (const row of lastSyncRows) {
    lastSyncByPlatform.set(row.platform, row.lastSync ? new Date(row.lastSync) : null);
  }

  const verifiedByPlatform = new Map<Platform, { verified: number; unverified: number }>();
  for (const row of verifiedRows) {
    const entry = verifiedByPlatform.get(row.platform) ?? { verified: 0, unverified: 0 };
    const count = Number(row.count);
    if (row.verified) entry.verified += count;
    else entry.unverified += count;
    verifiedByPlatform.set(row.platform, entry);
  }

  const errorCountByPlatform = new Map<Platform, number>();
  for (const row of errorsInLastRun) {
    if (isErrorPayload(row.payload)) {
      errorCountByPlatform.set(row.platform, (errorCountByPlatform.get(row.platform) ?? 0) + 1);
    }
  }

  const connectors: ConnectorStatus[] = PLATFORM_ORDER.map((platform) => ({
    platform,
    lastSuccessfulSync: lastSyncByPlatform.get(platform) ?? null,
    verifiedCount: verifiedByPlatform.get(platform)?.verified ?? 0,
    unverifiedCount: verifiedByPlatform.get(platform)?.unverified ?? 0,
    errorCountLastRun: errorCountByPlatform.get(platform) ?? 0,
  }));

  return {
    lastRunAt: latestRun?.startedAt ?? null,
    lastRunStatus: latestRun?.status ?? null,
    connectors,
  };
}
