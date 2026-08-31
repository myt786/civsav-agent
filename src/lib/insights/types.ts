import type { DailyPoint } from "../dashboard/types";

export type FlagSeverity = "critical" | "warning";

export type FlagKind =
  | "sync_error"
  | "stale_sync"
  | "leads_down"
  | "missed_calls_high"
  | "position_worsening";

export interface AttentionFlag {
  kind: FlagKind;
  severity: FlagSeverity;
  clientId: string;
  clientName: string;
  message: string;
}

export interface ForecastPoint {
  date: string; // yyyy-MM-dd
  value: number;
}

// A metric's recent history plus a short linear projection built from it.
// `forecast` is empty when there isn't enough history to fit a trend line.
export interface MetricForecast {
  key: "leads";
  label: string;
  history: DailyPoint[];
  forecast: ForecastPoint[];
  trend: "up" | "down" | "flat" | "unknown";
}

export interface ClientForecast {
  clientId: string;
  clientName: string;
  metric: MetricForecast;
}
