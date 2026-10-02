import type { Platform } from "../connectors/types";

// The four states a cell can be in. 'ok' and 'unverified' both carry a real
// value — 'unverified' means it hasn't been checked by hand against the
// platform's own UI yet, not that the value is untrustworthy in any other
// way. 'error' never carries a value: a failed fetch and a real zero must
// stay visually and structurally distinct all the way to the table.
export type CellState<T> =
  | { kind: "ok"; value: T }
  | { kind: "unverified"; value: T }
  | { kind: "no_data" }
  | { kind: "error"; message: string };

export interface CallsValue {
  total: number;
  // Corrected missed count (missedCalls - missedAndForwardedCalls) — a
  // forwarded call that was actually answered elsewhere doesn't count as
  // missed. See openphone's schema.ts.
  missed: number;
}

export type DeltaDirection = "up" | "down" | "flat" | "unknown";

export interface DeltaCell {
  // null when there's no usable prior-window baseline to compare against
  // (prior window is no_data, or summed to exactly zero).
  pct: number | null;
  direction: DeltaDirection;
}

export interface ClientRow {
  clientId: string;
  clientName: string;
  leads: CellState<number>;
  leadsDelta: DeltaCell;
  calls: CellState<CallsValue>;
  spend: CellState<number>;
  cpl: CellState<number>;
  sessions: CellState<number>;
  conversions: CellState<number>;
  avgPosition: CellState<number>;
  lastSyncedAt: Date | null;
  staleHours: number | null;
  // Which columns have an account behind them (an active mapping). A
  // column without one shows as "not connected" rather than a dash, so an
  // SEO-only client doesn't look like it's missing data. Optional so older
  // callers and test fixtures still build.
  connected?: Partial<Record<MetricColumn, boolean>>;
}

export type MetricColumn = "leads" | "calls" | "spend" | "cpl" | "sessions" | "conversions" | "avgPosition";

export interface ConnectorStatus {
  platform: Platform;
  lastSuccessfulSync: Date | null;
  // Active clients connected to this platform whose account has / hasn't
  // been checked in Settings.
  verifiedCount: number;
  unverifiedCount: number;
  errorCountLastRun: number;
}

export interface SyncStatusStrip {
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  connectors: ConnectorStatus[];
}

export interface DailyPoint {
  date: string; // yyyy-MM-dd
  value: number | null; // null = no data that day, distinct from a real 0
}

export interface SparklineMetric {
  key: "leads" | "callsTotal" | "callsMissed" | "spend" | "sessions" | "conversions" | "avgPosition";
  label: string;
  points: DailyPoint[];
}

export interface SourceBreakdownItem {
  platform: Platform;
  label: string;
  unit: "count" | "currency" | "position";
  cell: CellState<number>;
}

export interface ClientDetail {
  clientId: string;
  sparklines: SparklineMetric[];
  breakdown: SourceBreakdownItem[];
}

export interface DashboardData {
  generatedAt: Date;
  syncStatus: SyncStatusStrip;
  rows: ClientRow[];
  details: Record<string, ClientDetail>;
}
