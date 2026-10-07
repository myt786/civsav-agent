import { describe, expect, it } from "vitest";
import { buildPlatformFacts, changeOf, periodsFor, type SnapshotLike } from "./facts";

function ads(date: string, cost: number, clicks: number, conversions: number): SnapshotLike {
  return {
    date,
    metrics: { impressions: clicks * 10, clicks, cost, conversions, cpl: null, rangeStart: date, rangeEnd: date },
  };
}

describe("periodsFor", () => {
  it("uses the last full calendar month for monthly reports", () => {
    const p = periodsFor("monthly", new Date("2026-10-02T12:00:00Z"), "UTC");
    expect(p.current).toMatchObject({ start: "2026-09-01", end: "2026-09-30", label: "September 2026" });
    expect(p.previous).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("uses the last 30 days ending yesterday on demand", () => {
    const p = periodsFor("on_demand", new Date("2026-10-07T12:00:00Z"), "UTC");
    expect(p.current.start).toBe("2026-09-07");
    expect(p.current.end).toBe("2026-10-06");
    expect(p.previous).toEqual({ start: "2026-08-08", end: "2026-09-06" });
  });
});

describe("changeOf", () => {
  it("is a fraction, and null when there's nothing to compare with", () => {
    expect(changeOf(120, 100)).toBeCloseTo(0.2);
    expect(changeOf(50, 0)).toBeNull();
    expect(changeOf(null, 10)).toBeNull();
  });
});

describe("buildPlatformFacts", () => {
  const current = { start: "2026-09-01", end: "2026-09-30" };
  const previous = { start: "2026-08-01", end: "2026-08-31" };

  it("totals Google Ads per period and works out cost per conversion", () => {
    const rows = [ads("2026-09-03", 100, 50, 5), ads("2026-09-20", 200, 50, 5), ads("2026-08-10", 150, 40, 10), ads("2026-07-01", 999, 1, 1)];
    const facts = buildPlatformFacts("google_ads", rows, current, previous);
    const spend = facts.metrics.find((m) => m.label === "Spend")!;
    const cpc = facts.metrics.find((m) => m.label === "Cost per conversion")!;
    expect(spend).toMatchObject({ current: 300, previous: 150, change: 1 });
    expect(cpc).toMatchObject({ current: 30, previous: 15, lowerIsBetter: true });
    expect(facts.daysWithData).toBe(2);
    expect(facts.previousDaysWithData).toBe(1);
  });

  it("reports no data (not zero) for a period with no snapshots", () => {
    const facts = buildPlatformFacts("google_ads", [ads("2026-09-03", 100, 50, 5)], current, previous);
    const spend = facts.metrics.find((m) => m.label === "Spend")!;
    expect(spend.previous).toBeNull();
    expect(spend.change).toBeNull();
  });

  it("skips snapshots that don't match the platform's shape", () => {
    const facts = buildPlatformFacts("google_ads", [{ date: "2026-09-03", metrics: { error: "boom" } }], current, previous);
    expect(facts.daysWithData).toBe(0);
  });
});
