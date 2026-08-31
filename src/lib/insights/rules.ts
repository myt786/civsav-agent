import { addDays, format } from "date-fns";
import { STALE_HOURS, WINDOW_DAYS } from "../dashboard/constants";
import { formatCurrency } from "../dashboard/format";
import type { CellState, ClientDetail, ClientRow, DailyPoint, DashboardData } from "../dashboard/types";
import type { AttentionFlag, MetricForecast } from "./types";

const MISSED_CALL_RATE_THRESHOLD = 0.3;
const MISSED_CALL_MIN_VOLUME = 5;
// How many standard deviations the last 7 days' average has to sit from a
// metric's own prior baseline before it counts as a real departure rather
// than that metric's normal week-to-week noise. ~2 is the standard
// "worth a second look" cutoff (roughly the 95% band on a normal
// distribution) — loose enough not to fire on every wobble, tight enough
// to catch a real step change.
const ANOMALY_Z_THRESHOLD = 2;
// Below this many baseline days, a standard deviation is just noise from a
// tiny sample — skip the check rather than flag off a guess.
const MIN_BASELINE_DAYS = 5;

function metricErrorFlags(row: ClientRow): { field: string; message: string }[] {
  const checks: [string, CellState<unknown>][] = [
    ["Leads", row.leads],
    ["Calls", row.calls],
    ["Spend", row.spend],
    ["CPL", row.cpl],
    ["Sessions", row.sessions],
    ["Conversions", row.conversions],
    ["Avg. position", row.avgPosition],
  ];
  return checks
    .filter((entry): entry is [string, Extract<CellState<unknown>, { kind: "error" }>] => entry[1].kind === "error")
    .map(([field, cell]) => ({ field, message: cell.message }));
}

// Pure rule-based checks over data the dashboard has already computed
// (cell states, the existing 7-day delta, sync recency) — no model call,
// no extra DB round trip, and no chance of a flag disagreeing with what
// the table itself shows.
export function computeAttentionFlags(data: DashboardData): AttentionFlag[] {
  const flags: AttentionFlag[] = [];

  for (const row of data.rows) {
    const errors = metricErrorFlags(row);
    if (errors.length > 0) {
      flags.push({
        kind: "sync_error",
        severity: "critical",
        clientId: row.clientId,
        clientName: row.clientName,
        message: `${errors.map((e) => e.field).join(", ")} failed to sync: ${errors[0].message}`,
      });
    }

    if (row.staleHours !== null && row.staleHours > STALE_HOURS) {
      flags.push({
        kind: "stale_sync",
        severity: "warning",
        clientId: row.clientId,
        clientName: row.clientName,
        message: `No successful sync in ${row.staleHours}h (threshold is ${STALE_HOURS}h)`,
      });
    }

    if (row.leadsDelta.direction === "down" && row.leadsDelta.pct !== null) {
      flags.push({
        kind: "leads_down",
        severity: "warning",
        clientId: row.clientId,
        clientName: row.clientName,
        message: `Leads down ${Math.abs(row.leadsDelta.pct).toFixed(0)}% vs. the prior 7 days`,
      });
    }

    if ((row.calls.kind === "ok" || row.calls.kind === "unverified") && row.calls.value.total >= MISSED_CALL_MIN_VOLUME) {
      const rate = row.calls.value.missed / row.calls.value.total;
      if (rate > MISSED_CALL_RATE_THRESHOLD) {
        flags.push({
          kind: "missed_calls_high",
          severity: "warning",
          clientId: row.clientId,
          clientName: row.clientName,
          message: `${Math.round(rate * 100)}% of calls missed this week (${row.calls.value.missed}/${row.calls.value.total})`,
        });
      }
    }

    const detail = data.details[row.clientId];

    const positionSeries = detail?.sparklines.find((s) => s.key === "avgPosition");
    const positionZ = positionSeries && rollingZScore(positionSeries.points, WINDOW_DAYS);
    // Higher position number = worse ranking, so "worse" is the recent
    // average sitting above (not just different from) its own baseline.
    if (positionZ && positionZ.z > ANOMALY_Z_THRESHOLD && positionZ.recentMean > positionZ.baselineMean) {
      flags.push({
        kind: "position_worsening",
        severity: "warning",
        clientId: row.clientId,
        clientName: row.clientName,
        message: `Average search position (${positionZ.recentMean.toFixed(1)}) is a real step worse than its usual range (baseline ${positionZ.baselineMean.toFixed(1)})`,
      });
    }

    const spendSeries = detail?.sparklines.find((s) => s.key === "spend");
    const spendZ = spendSeries && rollingZScore(spendSeries.points, WINDOW_DAYS);
    if (spendZ && spendZ.z > ANOMALY_Z_THRESHOLD && spendZ.recentMean > spendZ.baselineMean) {
      flags.push({
        kind: "spend_spike",
        severity: "warning",
        clientId: row.clientId,
        clientName: row.clientName,
        message: `Daily spend has stepped up to ~${formatCurrency(spendZ.recentMean)}/day, above its ~${formatCurrency(spendZ.baselineMean)}/day baseline`,
      });
    }

    const sessionsSeries = detail?.sparklines.find((s) => s.key === "sessions");
    const sessionsZ = sessionsSeries && rollingZScore(sessionsSeries.points, WINDOW_DAYS);
    if (sessionsZ && sessionsZ.z < -ANOMALY_Z_THRESHOLD && sessionsZ.recentMean < sessionsZ.baselineMean) {
      flags.push({
        kind: "sessions_drop",
        severity: "warning",
        clientId: row.clientId,
        clientName: row.clientName,
        message: `Site sessions have dropped to ~${Math.round(sessionsZ.recentMean)}/day, below its ~${Math.round(sessionsZ.baselineMean)}/day baseline`,
      });
    }
  }

  return flags;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], m: number): number {
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Splits a daily series into "the last `recentDays` calendar slots" and
// "everything before that", by array position (not by count of known
// values) — so the split lines up with the same WINDOW_DAYS the rest of
// the dashboard uses for "this week", regardless of how many of those
// slots have data.
function splitRecentVsBaseline(points: DailyPoint[], recentDays: number): { recent: number[]; baseline: number[] } {
  const cutoff = points.length - recentDays;
  const recent = points
    .slice(cutoff)
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  const baseline = points
    .slice(0, cutoff)
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  return { recent, baseline };
}

// A standard z-score of the recent window's mean against a baseline built
// from everything before it: (recentMean - baselineMean) / standardError,
// where standardError shrinks the baseline's spread by how many recent
// days are being averaged. Two clients with the same 20% swing get
// different verdicts here on purpose — one whose numbers are usually
// steady is a real signal, one that swings 20% most weeks isn't.
// Returns null when there's too little baseline to trust a spread from.
function rollingZScore(
  points: DailyPoint[],
  recentDays: number,
): { z: number; recentMean: number; baselineMean: number } | null {
  const { recent, baseline } = splitRecentVsBaseline(points, recentDays);
  if (recent.length < 2 || baseline.length < MIN_BASELINE_DAYS) return null;

  const baselineMean = mean(baseline);
  const recentMean = mean(recent);
  const baselineStdDev = stdDev(baseline, baselineMean);

  if (baselineStdDev === 0) {
    // A perfectly flat baseline: literally any change is a departure from
    // it, not noise — report it as maximally significant rather than
    // dividing by zero.
    const z = recentMean === baselineMean ? 0 : recentMean > baselineMean ? Infinity : -Infinity;
    return { z, recentMean, baselineMean };
  }

  const standardError = baselineStdDev / Math.sqrt(recent.length);
  return { z: (recentMean - baselineMean) / standardError, recentMean, baselineMean };
}

// Least-squares fit of value ~ a + b * index over the non-null points,
// index counted across the whole series (gaps included) so slope stays in
// "change per calendar day" units regardless of how sparse the data is.
// Returns nulls when fewer than two points exist to fit a line through.
function fitTrend(points: DailyPoint[]): { slope: number; intercept: number } | { slope: null; intercept: null } {
  const known = points
    .map((p, index) => ({ index, value: p.value }))
    .filter((p): p is { index: number; value: number } => p.value !== null);

  if (known.length < 2) return { slope: null, intercept: null };

  const n = known.length;
  const sumX = known.reduce((s, p) => s + p.index, 0);
  const sumY = known.reduce((s, p) => s + p.value, 0);
  const sumXY = known.reduce((s, p) => s + p.index * p.value, 0);
  const sumXX = known.reduce((s, p) => s + p.index * p.index, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: null, intercept: null };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// Projects `daysAhead` points past the end of `points` using a linear fit
// through its non-null history. Never extrapolates from fewer than 5
// known days — a 2-point line is a coin flip, not a forecast — and never
// projects a value below zero, since every metric this feeds is a count
// or a currency amount.
export function computeForecast(
  key: MetricForecast["key"],
  label: string,
  unit: MetricForecast["unit"],
  points: DailyPoint[],
  daysAhead: number,
  noiseBandPct: number,
): MetricForecast {
  const knownCount = points.filter((p) => p.value !== null).length;
  const { slope, intercept } = knownCount >= 5 ? fitTrend(points) : { slope: null, intercept: null };

  if (slope === null || intercept === null || points.length === 0) {
    return { key, label, unit, history: points, forecast: [], trend: "unknown" };
  }

  const lastDate = points[points.length - 1].date;
  const forecast = Array.from({ length: daysAhead }, (_, i) => {
    const index = points.length + i;
    const value = Math.max(0, slope * index + intercept);
    return { date: format(addDays(new Date(`${lastDate}T00:00:00`), i + 1), "yyyy-MM-dd"), value };
  });

  // Trend direction judged the same way a delta is: a flat-looking slope
  // over the whole window is noise, not a real trajectory.
  const projectedChangePct = intercept !== 0 ? ((slope * points.length) / Math.abs(intercept)) * 100 : 0;
  const trend = Math.abs(projectedChangePct) < noiseBandPct ? "flat" : projectedChangePct > 0 ? "up" : "down";

  return { key, label, unit, history: points, forecast, trend };
}

export interface ClientMetricForecast {
  clientId: string;
  clientName: string;
  metric: MetricForecast;
}

const FORECAST_METRICS: { key: MetricForecast["key"]; sparklineKey: "leads" | "spend"; label: string; unit: MetricForecast["unit"] }[] = [
  { key: "leads", sparklineKey: "leads", label: "Leads", unit: "count" },
  { key: "spend", sparklineKey: "spend", label: "Spend", unit: "currency" },
];

// One forecast per (client, metric) pair, for every metric in
// FORECAST_METRICS that has a matching sparkline series — a client
// missing that connector just doesn't get a card for it.
export function buildForecasts(data: DashboardData, daysAhead: number, noiseBandPct: number): ClientMetricForecast[] {
  const results: ClientMetricForecast[] = [];
  for (const row of data.rows) {
    const detail: ClientDetail | undefined = data.details[row.clientId];
    for (const { key, sparklineKey, label, unit } of FORECAST_METRICS) {
      const series = detail?.sparklines.find((s) => s.key === sparklineKey);
      if (!series) continue;
      results.push({
        clientId: row.clientId,
        clientName: row.clientName,
        metric: computeForecast(key, label, unit, series.points, daysAhead, noiseBandPct),
      });
    }
  }
  return results;
}
