import { describe, expect, it } from "vitest";
import { buildLeadFunnel } from "./leads";
import type { SnapshotLike } from "./facts";
import type { Platform } from "../connectors/types";

const current = { start: "2026-09-01", end: "2026-09-30" };
const previous = { start: "2026-08-01", end: "2026-08-31" };

function ld(date: string, total: number, completed: number, spam: number): SnapshotLike {
  return {
    date,
    metrics: { totalLeads: total, byStatus: { completed, abandoned: total - completed }, spamLeads: spam, rangeStart: date, rangeEnd: date },
  };
}
function phone(date: string, calls: number, missed: number): SnapshotLike {
  return {
    date,
    metrics: {
      totalCalls: calls,
      missedCalls: missed,
      forwardedCalls: 0,
      missedAndForwardedCalls: 0,
      totalDurationSeconds: calls * 60,
      rangeStart: date,
      rangeEnd: date,
    },
  };
}
function ads(date: string, cost: number, conversions: number): SnapshotLike {
  return { date, metrics: { impressions: 1000, clicks: 50, cost, conversions, cpl: null, rangeStart: date, rangeEnd: date } };
}

describe("buildLeadFunnel", () => {
  const rows = new Map<Platform, SnapshotLike[]>([
    // 2026-09-07 is a Monday, 2026-09-12 a Saturday.
    ["lead_dashboard", [ld("2026-09-07", 10, 8, 1), ld("2026-09-12", 10, 6, 1), ld("2026-08-10", 10, 9, 0)]],
    ["openphone", [phone("2026-09-07", 20, 5), phone("2026-08-10", 20, 2)]],
    ["google_ads", [ads("2026-09-07", 300, 6), ads("2026-08-10", 200, 4)]],
  ]);
  const funnel = buildLeadFunnel(rows, ["lead_dashboard", "openphone", "google_ads"], current, previous)!;
  const metric = (label: string) => funnel.metrics.find((m) => m.label === label)!;

  it("adds every connected source into total leads (form spam left out, answered calls only)", () => {
    expect(funnel.sources).toEqual(["Website forms", "Answered calls", "Google Ads conversions"]);
    // forms 18 (20 - 2 spam) + answered calls 15 + Google Ads 6; before: 10 + 18 + 4
    expect(metric("Total leads (all sources)")).toMatchObject({ current: 39, previous: 32 });
    expect(metric("Leads · Website forms")).toMatchObject({ current: 18, previous: 10 });
    expect(metric("Completed forms")).toMatchObject({ current: 14, previous: 9 });
    expect(metric("Form completion rate").current).toBeCloseTo(70);
    expect(metric("Spam rate").current).toBeCloseTo(10);
    expect(metric("Missed-call rate").current).toBeCloseTo(25);
  });

  it("works out blended cost per lead from all ad spend", () => {
    expect(metric("Paid ad spend (Google + Meta)")).toMatchObject({ current: 300, previous: 200 });
    expect(metric("Blended cost per lead").current).toBeCloseTo(300 / 39);
    expect(metric("Blended cost per lead")).toMatchObject({ previous: 6.25, lowerIsBetter: true });
  });

  it("splits leads and missed calls by weekday", () => {
    const mon = funnel.weekdays.find((d) => d.day === "Mon")!;
    const sat = funnel.weekdays.find((d) => d.day === "Sat")!;
    expect(mon).toMatchObject({ leads: 30, calls: 20, missedCalls: 5 });
    expect(sat).toMatchObject({ leads: 9, calls: 0, missedCalls: 0 });
  });

  it("lists each source's leads side by side", () => {
    expect(funnel.channels.map((c) => c.label)).toEqual(["Website forms", "Answered calls", "Google Ads conversions"]);
    expect(funnel.channels[1]).toMatchObject({ current: 15, previous: 18 });
  });

  it("leaves out a source switched off for the client", () => {
    const off = buildLeadFunnel(rows, ["lead_dashboard", "openphone", "google_ads"], current, previous, ["google_ads"])!;
    expect(off.metrics.find((m) => m.label === "Total leads (all sources)")).toMatchObject({ current: 33, previous: 28 });
  });

  it("uses GoHighLevel when there's no Lead Dashboard", () => {
    const ghl = new Map<Platform, SnapshotLike[]>([
      ["ghl", [{ date: "2026-09-02", metrics: { leadCount: 7, pipelineStages: [], opportunityValue: 0, rangeStart: "x", rangeEnd: "x" } }]],
    ]);
    const f = buildLeadFunnel(ghl, ["ghl"], current, previous)!;
    expect(f.source).toBe("ghl");
    expect(f.metrics.find((m) => m.label === "Total leads (all sources)")?.current).toBe(7);
  });

  it("returns null with nothing lead-related connected", () => {
    expect(buildLeadFunnel(new Map(), ["ahrefs"], current, previous)).toBeNull();
  });
});
