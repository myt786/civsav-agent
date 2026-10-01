import type { CellState, ClientDetail, ClientRow, DailyPoint, SparklineMetric } from "./types";

// Sums a numeric cell across rows, counting 'ok' and 'unverified' alike
// (both carry a real value — see CellState's doc comment) and skipping
// 'no_data' and 'error' rows entirely rather than treating them as zero.
// Returns null, not 0, when no row had a usable value — same "missing
// isn't a real zero" rule the per-cell rendering already follows.
export function sumOkOrUnverified(rows: ClientRow[], selector: (row: ClientRow) => CellState<number>): number | null {
  let sum = 0;
  let any = false;
  for (const row of rows) {
    const cell = selector(row);
    if (cell.kind === "ok" || cell.kind === "unverified") {
      sum += cell.value;
      any = true;
    }
  }
  return any ? sum : null;
}

// Sums one sparkline metric (e.g. "leads") across every client, day by
// day, for the fleet trend chart on the dashboard. A date bucket stays
// null — not 0 — when every client had no data that day, same "missing
// isn't a real zero" rule sumOkOrUnverified follows for the 7d totals.
// Clients on different timezones bucket by their own local date string,
// so this is a supplementary visual, not a precise per-day figure — the
// exact numbers stay in the table and the detail sheet's own sparkline.
export function buildFleetDailySeries(details: Record<string, ClientDetail>, key: SparklineMetric["key"]): DailyPoint[] {
  const byDate = new Map<string, { sum: number; any: boolean }>();
  for (const detail of Object.values(details)) {
    const series = detail.sparklines.find((s) => s.key === key);
    if (!series) continue;
    for (const point of series.points) {
      const bucket = byDate.get(point.date) ?? { sum: 0, any: false };
      if (point.value !== null) {
        bucket.sum += point.value;
        bucket.any = true;
      }
      byDate.set(point.date, bucket);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, any }]) => ({ date, value: any ? sum : null }));
}

// Last 7 days vs the 7 before, from a fleet daily series. Null when either
// week has too few days with data to compare honestly (e.g. spend that only
// started being collected last week) or the earlier week was zero.
export function weekOverWeekPct(points: DailyPoint[]): number | null {
  const recent = points.slice(-7);
  const previous = points.slice(-14, -7);
  const sum = (week: DailyPoint[]) => {
    const values = week.map((p) => p.value).filter((v): v is number => v !== null);
    return values.length >= 4 ? values.reduce((a, b) => a + b, 0) : null;
  };
  const a = sum(recent);
  const b = sum(previous);
  if (a === null || b === null || b === 0) return null;
  return ((a - b) / b) * 100;
}

// How many clients have a usable value in a cell — "from 28 clients".
export function countWithValue(rows: ClientRow[], selector: (row: ClientRow) => CellState<unknown>): number {
  return rows.filter((row) => {
    const cell = selector(row);
    return cell.kind === "ok" || cell.kind === "unverified";
  }).length;
}
