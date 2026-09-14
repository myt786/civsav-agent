import { describe, expect, it } from "vitest";
import { computePortfolioAggregates, computeRowMetrics, tierFor, trendFor } from "./compute";

describe("tierFor", () => {
  it("buckets at the exact boundaries", () => {
    expect(tierFor(null)).toBe("no_data");
    expect(tierFor(0)).toBe("no_data");
    expect(tierFor(49)).toBe("minimal");
    expect(tierFor(50)).toBe("small");
    expect(tierFor(299)).toBe("small");
    expect(tierFor(300)).toBe("moderate");
    expect(tierFor(999)).toBe("moderate");
    expect(tierFor(1000)).toBe("strong");
  });
});

describe("trendFor", () => {
  it("is unknown when either side is missing", () => {
    expect(trendFor(null, 100)).toBe("unknown");
    expect(trendFor(100, null)).toBe("unknown");
  });

  it("is low_vol when the baseline is below MIN_VOLUME_FOR_TREND, regardless of the swing", () => {
    expect(trendFor(49, 200)).toBe("low_vol");
    expect(trendFor(2, 4)).toBe("low_vol"); // a 2->4 click swing looks like +100% but is noise
  });

  it("buckets at the exact percentage boundaries (each threshold is inclusive on the higher tier's side, matching the Python original)", () => {
    expect(trendFor(100, 120)).toBe("growing_fast"); // +20%
    expect(trendFor(100, 119)).toBe("growing"); // +19%
    expect(trendFor(100, 105)).toBe("growing"); // +5%
    expect(trendFor(100, 104)).toBe("stable"); // +4%
    expect(trendFor(100, 96)).toBe("stable"); // -4%
    expect(trendFor(100, 95)).toBe("stable"); // -5% is still Stable's lower bound
    expect(trendFor(100, 84)).toBe("declining"); // -16%
    expect(trendFor(100, 80)).toBe("declining"); // -20% is still Declining's lower bound
    expect(trendFor(100, 79)).toBe("falling_fast"); // -21%
  });
});

describe("computeRowMetrics", () => {
  it("computes tier/trend/momPct/avg3 for a full 3-month row", () => {
    const rm = computeRowMetrics([500, 600, 720]);
    expect(rm.tier).toBe("moderate");
    expect(rm.trend).toBe("growing_fast"); // 500 -> 720 = +44%
    expect(rm.momPct).toBeCloseTo(0.2, 5); // 600 -> 720 = +20%
    expect(rm.avg3).toBeCloseTo((500 + 600 + 720) / 3, 5);
  });

  it("leaves momPct null when the prior month is below MIN_VOLUME_FOR_TREND", () => {
    const rm = computeRowMetrics([10, 30, 200]);
    expect(rm.momPct).toBeNull();
  });

  it("leaves momPct null when the prior month is missing entirely", () => {
    const rm = computeRowMetrics([null, null, 200]);
    expect(rm.momPct).toBeNull();
    expect(rm.avg3).toBe(200);
  });

  it("returns avg3 null only when all three months are null", () => {
    const rm = computeRowMetrics([null, null, null]);
    expect(rm.avg3).toBeNull();
    expect(rm.tier).toBe("no_data");
    expect(rm.trend).toBe("unknown");
  });
});

describe("computePortfolioAggregates", () => {
  it("sums clicks across rows and computes portfolio-level mom/3mo", () => {
    const rows = [computeRowMetrics([100, 200, 300]), computeRowMetrics([50, 50, 100])];
    const agg = computePortfolioAggregates(rows, [5, null, -2]);

    expect(agg.clicksOldest).toBe(150);
    expect(agg.clicksPrev).toBe(250);
    expect(agg.clicksNewest).toBe(400);
    expect(agg.portfolioMomPct).toBeCloseTo((400 - 250) / 250, 5);
    expect(agg.portfolio3moPct).toBeCloseTo((400 - 150) / 150, 5);
    // Only positive deltas count toward "new referring domains gained" —
    // a net loss (-2) doesn't offset another client's gain.
    expect(agg.newReferringDomainsSum).toBe(5);
  });

  it("returns null (not zero) mom/3mo when the baseline sums to zero", () => {
    const rows = [computeRowMetrics([null, null, 100])];
    const agg = computePortfolioAggregates(rows, []);

    expect(agg.portfolioMomPct).toBeNull();
    expect(agg.portfolio3moPct).toBeNull();
  });

  it("counts every row into exactly one tier bucket", () => {
    const rows = [
      computeRowMetrics([null, null, null]), // no_data
      computeRowMetrics([null, null, 10]), // minimal
      computeRowMetrics([null, null, 1500]), // strong
    ];
    const agg = computePortfolioAggregates(rows, []);

    expect(agg.tierCounts).toEqual({ strong: 1, moderate: 0, small: 0, minimal: 1, no_data: 1 });
  });
});
