import { describe, expect, it } from "vitest";
import { countedLeadSources, leadsFromSnapshot } from "./sources";

describe("lead sources", () => {
  it("counts every connected source unless it's switched off", () => {
    const connected = (p: string) => ["lead_dashboard", "openphone", "google_ads"].includes(p);
    expect(countedLeadSources(connected, [])).toEqual(["lead_dashboard", "calls", "google_ads"]);
    expect(countedLeadSources(connected, ["google_ads"])).toEqual(["lead_dashboard", "calls"]);
  });

  it("leaves spam out of form leads and counts only answered calls", () => {
    expect(
      leadsFromSnapshot("lead_dashboard", { totalLeads: 10, byStatus: { completed: 8, abandoned: 2 }, spamLeads: 3, rangeStart: "a", rangeEnd: "b" }),
    ).toBe(7);
    expect(
      leadsFromSnapshot("calls", {
        totalCalls: 12,
        missedCalls: 4,
        forwardedCalls: 1,
        missedAndForwardedCalls: 1,
        totalDurationSeconds: 600,
        rangeStart: "a",
        rangeEnd: "b",
      }),
    ).toBe(9);
  });

  it("returns null for a snapshot that doesn't parse", () => {
    expect(leadsFromSnapshot("ghl", { nope: true })).toBeNull();
  });
});
