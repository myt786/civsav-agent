import type { z } from "zod";
import type { CallsValue, CellState, DeltaCell, DeltaDirection } from "./types";
import { NOISE_BAND_PCT } from "./constants";

export interface SnapshotRow {
  date: string;
  verified: boolean;
  metrics: unknown;
}

// A payload written by sync/run.ts's error branch is exactly `{ error:
// "<message>" }` — no other connector's raw envelope happens to be a
// single-key object with that shape (checked against all eight fixtures),
// so this is a safe way to recognize a failed attempt from raw_responses
// without a dedicated status column.
export function isErrorPayload(payload: unknown): payload is { error: string } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  return keys.length === 1 && keys[0] === "error" && typeof (payload as Record<string, unknown>).error === "string";
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function average(values: number[]): number {
  return sum(values) / values.length;
}

// Builds a single numeric cell from a client+platform's snapshot rows over
// some window. Empty window + a failed most-recent attempt -> error (there
// really is no number, and the reason is a fetch failure, not silence).
// Empty window + no recorded attempt -> no_data (never configured, or a
// genuinely empty response). Any contributing row unverified -> the whole
// rollup is unverified; a week built from partly-unreconciled days is
// honestly reported as unreconciled, not quietly promoted to "ok".
export function buildNumericCell<TData>(
  rows: SnapshotRow[],
  schema: z.ZodType<TData>,
  extract: (data: TData) => number,
  lastAttemptError: string | null,
  reducer: (values: number[]) => number = sum,
): CellState<number> {
  if (rows.length === 0) {
    return lastAttemptError ? { kind: "error", message: lastAttemptError } : { kind: "no_data" };
  }

  const values: number[] = [];
  let anyUnverified = false;
  for (const row of rows) {
    const parsed = schema.safeParse(row.metrics);
    if (!parsed.success) {
      return {
        kind: "error",
        message: `stored metrics for ${row.date} failed schema validation: ${parsed.error.message}`,
      };
    }
    values.push(extract(parsed.data));
    if (!row.verified) anyUnverified = true;
  }

  const value = reducer(values);
  return anyUnverified ? { kind: "unverified", value } : { kind: "ok", value };
}

export function buildCallsCell(
  rows: SnapshotRow[],
  schema: z.ZodType<{ totalCalls: number; missedCalls: number; missedAndForwardedCalls: number }>,
  lastAttemptError: string | null,
): CellState<CallsValue> {
  if (rows.length === 0) {
    return lastAttemptError ? { kind: "error", message: lastAttemptError } : { kind: "no_data" };
  }

  let total = 0;
  let missed = 0;
  let anyUnverified = false;
  for (const row of rows) {
    const parsed = schema.safeParse(row.metrics);
    if (!parsed.success) {
      return {
        kind: "error",
        message: `stored metrics for ${row.date} failed schema validation: ${parsed.error.message}`,
      };
    }
    total += parsed.data.totalCalls;
    // Corrected missed count, per the connector's own guidance: a call
    // flagged "missed" that was actually forwarded and answered elsewhere
    // shouldn't inflate the missed count.
    missed += parsed.data.missedCalls - parsed.data.missedAndForwardedCalls;
    if (!row.verified) anyUnverified = true;
  }

  const value: CallsValue = { total, missed };
  return anyUnverified ? { kind: "unverified", value } : { kind: "ok", value };
}

// Combines cells that feed one blended column (e.g. spend = google_ads +
// meta). Any error wins outright; otherwise sums whatever ok/unverified
// contributors exist; no_data only when nothing contributed at all.
export function sumCells(cells: CellState<number>[]): CellState<number> {
  const errors = cells.filter((c): c is { kind: "error"; message: string } => c.kind === "error");
  if (errors.length > 0) {
    return { kind: "error", message: errors.map((e) => e.message).join("; ") };
  }

  const contributing = cells.filter(
    (c): c is { kind: "ok" | "unverified"; value: number } => c.kind === "ok" || c.kind === "unverified",
  );
  if (contributing.length === 0) return { kind: "no_data" };

  const value = sum(contributing.map((c) => c.value));
  const anyUnverified = contributing.some((c) => c.kind === "unverified");
  return anyUnverified ? { kind: "unverified", value } : { kind: "ok", value };
}

// CPL = spend / leads. null (not 0) when there are no leads to divide by —
// distinguishing "really is zero cost per lead" from "can't compute" the
// same way every connector's own cpl field already does.
export function divideCells(numerator: CellState<number>, denominator: CellState<number>): CellState<number> {
  if (numerator.kind === "error") return numerator;
  if (denominator.kind === "error") return denominator;
  if (numerator.kind === "no_data" || denominator.kind === "no_data") return { kind: "no_data" };
  if (denominator.value === 0) return { kind: "no_data" };

  const value = numerator.value / denominator.value;
  const anyUnverified = numerator.kind === "unverified" || denominator.kind === "unverified";
  return anyUnverified ? { kind: "unverified", value } : { kind: "ok", value };
}

// A mapping that has never been verified (via the settings UI's Verify
// action) has its numbers downgraded to unverified regardless of the
// per-day reconciliation flag — a config typo caught late looks exactly
// like real data otherwise, and there's been no check at all that this
// external ID resolves to the right account.
export function downgradeIfUnverifiedMapping<T>(cell: CellState<T>, mappingVerified: boolean): CellState<T> {
  if (mappingVerified || cell.kind !== "ok") return cell;
  return { kind: "unverified", value: cell.value };
}

export function computeDelta(current: CellState<number>, previous: CellState<number>): DeltaCell {
  if (
    current.kind === "error" ||
    previous.kind === "error" ||
    current.kind === "no_data" ||
    previous.kind === "no_data" ||
    previous.value === 0
  ) {
    return { pct: null, direction: "unknown" };
  }

  const pct = ((current.value - previous.value) / previous.value) * 100;
  const direction: DeltaDirection = pct > NOISE_BAND_PCT ? "up" : pct < -NOISE_BAND_PCT ? "down" : "flat";
  return { pct, direction };
}

export { average };
