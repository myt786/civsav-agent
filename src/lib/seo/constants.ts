// Ported verbatim from seo-ai-tool/build_dashboard.py's _tier/_trend and
// MIN_VOLUME_FOR_TREND — same thresholds, same semantics, now computed
// from live metric_snapshots instead of a monthly Excel run.

// Below this baseline-month click count, Trend/MoM% are noise (a 2->4
// click swing looks like "+100%") — render "Low Vol" instead of a
// misleading arrow/percentage. Matches the Tier "Small" boundary.
export const MIN_VOLUME_FOR_TREND = 50;

export const TIER_THRESHOLDS = {
  strong: 1000,
  moderate: 300,
  small: 50,
} as const;

export const TREND_BANDS = {
  growingFast: 0.2,
  growing: 0.05,
  declining: -0.05,
  fallingFast: -0.2,
} as const;

export const MONTHS_SHOWN = 3;
