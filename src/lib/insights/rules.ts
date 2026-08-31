import { addDays, format } from "date-fns";
import { STALE_HOURS } from "../dashboard/constants";
import type { CellState, ClientDetail, ClientRow, DailyPoint, DashboardData } from "../dashboard/types";
import type { AttentionFlag, MetricForecast } from "./types";

const MISSED_CALL_RATE_THRESHOLD = 0.3;
const MISSED_CALL_MIN_VOLUME = 5;
// Position points per day, over the forecast window, before a drifting
// average-position line counts as "worsening" rather than noise.
const POSITION_TREND_THRESHOLD = 0.03;

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
    if (positionSeries) {
      const { slope } = fitTrend(positionSeries.points);
      if (slope !== null && slope > POSITION_TREND_THRESHOLD) {
        flags.push({
          kind: "position_worsening",
          severity: "warning",
          clientId: row.clientId,
          clientName: row.clientName,
          message: `Average search position has drifted worse over the last 30 days`,
        });
      }
    }
  }

  return flags;
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
  points: DailyPoint[],
  daysAhead: number,
  noiseBandPct: number,
): MetricForecast {
  const knownCount = points.filter((p) => p.value !== null).length;
  const { slope, intercept } = knownCount >= 5 ? fitTrend(points) : { slope: null, intercept: null };

  if (slope === null || intercept === null || points.length === 0) {
    return { key, label, history: points, forecast: [], trend: "unknown" };
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

  return { key, label, history: points, forecast, trend };
}

export function buildLeadsForecasts(data: DashboardData, daysAhead: number, noiseBandPct: number) {
  return data.rows
    .map((row) => {
      const detail: ClientDetail | undefined = data.details[row.clientId];
      const leadsSeries = detail?.sparklines.find((s) => s.key === "leads");
      if (!leadsSeries) return null;
      return {
        clientId: row.clientId,
        clientName: row.clientName,
        metric: computeForecast("leads", "Leads", leadsSeries.points, daysAhead, noiseBandPct),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
}
