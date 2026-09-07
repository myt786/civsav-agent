import type { Platform } from "../connectors/types";

export { PLATFORM_LABELS, PLATFORM_ORDER } from "../connectors/platform-labels";

// Only these platforms feed the client table's columns — the strip above
// still reports every registered connector, ahrefs and ghl included.
export const TABLE_PLATFORMS = [
  "lead_dashboard",
  "openphone",
  "google_ads",
  "meta",
  "ga4",
  "search_console",
] as const satisfies readonly Platform[];

export const WINDOW_DAYS = 7;
export const SPARKLINE_DAYS = 30;
export const STALE_HOURS = 36;
// Deltas within this band render muted — "no meaningful change" rather
// than a false-precision +2.1% in either direction.
export const NOISE_BAND_PCT = 5;
