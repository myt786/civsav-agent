import type { CellState, ClientRow } from "./types";

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
