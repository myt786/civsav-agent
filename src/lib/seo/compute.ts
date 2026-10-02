import { MIN_VOLUME_FOR_TREND, TIER_THRESHOLDS, TREND_BANDS } from "./constants";

export type Tier = "strong" | "moderate" | "small" | "minimal" | "no_data";
export type Trend = "low_vol" | "growing_fast" | "growing" | "stable" | "declining" | "falling_fast" | "unknown";

// Best -> worst, for sorting the /seo table by column instead of only by
// raw click counts (a "No Data" row and a "Falling fast" row are both
// worth surfacing near the top when sorting by Tier/Trend).
export const TIER_RANK: Record<Tier, number> = { strong: 0, moderate: 1, small: 2, minimal: 3, no_data: 4 };
export const TREND_RANK: Record<Trend, number> = {
  growing_fast: 0,
  growing: 1,
  stable: 2,
  declining: 3,
  falling_fast: 4,
  low_vol: 5,
  unknown: 6,
};

// Port of _tier() in build_dashboard.py, with one deliberate difference:
// a real 0 (Search Console connected and reporting, nobody clicked) is
// "minimal", not "no_data". The spreadsheet couldn't tell the two apart;
// here null already means "no numbers", so 0 shouldn't be lumped in with it.
export function tierFor(newestClicks: number | null): Tier {
  if (newestClicks === null) return "no_data";
  if (newestClicks >= TIER_THRESHOLDS.strong) return "strong";
  if (newestClicks >= TIER_THRESHOLDS.moderate) return "moderate";
  if (newestClicks >= TIER_THRESHOLDS.small) return "small";
  return "minimal";
}

// Direct port of _trend() in build_dashboard.py.
export function trendFor(oldest: number | null, newest: number | null): Trend {
  if (oldest === null || newest === null) return "unknown";
  if (oldest < MIN_VOLUME_FOR_TREND) return "low_vol";
  const pct = (newest - oldest) / oldest;
  if (pct >= TREND_BANDS.growingFast) return "growing_fast";
  if (pct >= TREND_BANDS.growing) return "growing";
  if (pct >= TREND_BANDS.declining) return "stable";
  if (pct >= TREND_BANDS.fallingFast) return "declining";
  return "falling_fast";
}

export interface RowMetrics {
  oldest: number | null;
  prev: number | null;
  newest: number | null;
  tier: Tier;
  trend: Trend;
  // Month-over-month change (prev -> newest), null when there's no usable
  // baseline (prev is missing, or below MIN_VOLUME_FOR_TREND).
  momPct: number | null;
  // Average of whichever of the 3 months have real values — null only
  // when all 3 are null.
  avg3: number | null;
}

// Direct port of the per-row half of compute_row_metrics() in
// build_dashboard.py. `clicks` is oldest -> newest (3 months).
export function computeRowMetrics(clicks: readonly [number | null, number | null, number | null]): RowMetrics {
  const [oldest, prev, newest] = clicks;
  const tier = tierFor(newest);
  const trend = trendFor(oldest, newest);

  const momPct = prev !== null && newest !== null && prev >= MIN_VOLUME_FOR_TREND ? (newest - prev) / prev : null;

  const present = [oldest, prev, newest].filter((v): v is number => v !== null);
  const avg3 = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : null;

  return { oldest, prev, newest, tier, trend, momPct, avg3 };
}

export interface PortfolioAggregates {
  clicksNewest: number;
  clicksPrev: number;
  clicksOldest: number;
  portfolioMomPct: number | null;
  portfolio3moPct: number | null;
  tierCounts: Record<Tier, number>;
  newReferringDomainsSum: number;
}

// Direct port of the aggregate half of compute_row_metrics().
export function computePortfolioAggregates(
  rowMetrics: readonly RowMetrics[],
  newReferringDomains: readonly (number | null)[],
): PortfolioAggregates {
  const clicksNewest = rowMetrics.reduce((sum, r) => sum + (r.newest ?? 0), 0);
  const clicksPrev = rowMetrics.reduce((sum, r) => sum + (r.prev ?? 0), 0);
  const clicksOldest = rowMetrics.reduce((sum, r) => sum + (r.oldest ?? 0), 0);

  const tierCounts: Record<Tier, number> = { strong: 0, moderate: 0, small: 0, minimal: 0, no_data: 0 };
  for (const r of rowMetrics) tierCounts[r.tier]++;

  // Changes compare like with like: only clients with numbers in both
  // months count. Summing everyone instead made a client whose newest month
  // hadn't synced look like a portfolio-wide drop (counted in the earlier
  // month, missing from the later one) — and a newly connected client look
  // like portfolio growth.
  const changeBetween = (pick: (r: RowMetrics) => number | null) => {
    let from = 0;
    let to = 0;
    for (const r of rowMetrics) {
      const earlier = pick(r);
      if (earlier === null || r.newest === null) continue;
      from += earlier;
      to += r.newest;
    }
    return from > 0 ? (to - from) / from : null;
  };

  return {
    clicksNewest,
    clicksPrev,
    clicksOldest,
    portfolioMomPct: changeBetween((r) => r.prev),
    portfolio3moPct: changeBetween((r) => r.oldest),
    tierCounts,
    newReferringDomainsSum: newReferringDomains.filter((v): v is number => v !== null && v > 0).reduce((a, b) => a + b, 0),
  };
}
