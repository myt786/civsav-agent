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
