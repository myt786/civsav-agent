import { describe, expect, it } from "vitest";
import { checkDrop, checkStopped, detectLeadAlerts, type DayValue, type LeadSeries } from "./detect";

// Daily values ending yesterday; dates count back from 2026-11-12.
function series(values: (number | null)[], source = "total", label = "All leads", dataProblem: string | null = null): LeadSeries {
  const end = Date.parse("2026-11-12T12:00:00Z");
  const days: DayValue[] = values.map((value, i) => ({
    date: new Date(end - (values.length - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
  return { source, label, days, dataProblem };
}

const steady = (perDay: number, n: number) => Array.from({ length: n }, () => perDay);

describe("checkStopped", () => {
  it("fires after one empty day for a busy client", () => {
    expect(checkStopped(series([...steady(6, 30), 0]), "normal")).toMatchObject({ emptyDays: 1 });
  });

  it("waits longer for a quiet client", () => {
    // 1 a day: needs 5 empty days at normal sensitivity (1 × 5 ≥ 4.6).
    expect(checkStopped(series([...steady(1, 30), 0, 0, 0, 0]), "normal")).toBe(null);
    expect(checkStopped(series([...steady(1, 30), 0, 0, 0, 0, 0]), "normal")).toMatchObject({ emptyDays: 5 });
  });

  it("counts today so far in the afternoon, and clears when today has leads", () => {
    const s = series([...steady(4, 30), 0]);
    // 4 × 1 = 4 < 4.6, but with half of today empty: 4 × 1.5 = 6.
    expect(checkStopped(s, "normal")).toBe(null);
    expect(checkStopped(s, "normal", { value: 0, fraction: 0.5 })).toMatchObject({ emptyDays: 1.5 });
    expect(checkStopped(s, "normal", { value: 2, fraction: 0.5 })).toBe(null);
  });

  it("skips unknown days and needs enough history", () => {
    expect(checkStopped(series([...steady(6, 30), null, 0]), "normal")).toMatchObject({ emptyDays: 1 });
    expect(checkStopped(series([...steady(6, 10), 0, 0]), "normal")).toBe(null);
    expect(checkStopped(series([...steady(0, 30), 0, 0]), "normal")).toBe(null);
  });
});

describe("checkDrop", () => {
  it("compares the last 3 days with the same weekdays", () => {
    expect(checkDrop(series([...steady(5, 28), 1, 1, 1]), "normal")).toEqual({ expected: 15, actual: 3 });
    expect(checkDrop(series([...steady(5, 28), 4, 4, 4]), "normal")).toBe(null);
  });

  it("ignores small clients", () => {
    expect(checkDrop(series([...steady(1, 28), 0, 0, 1]), "normal")).toBe(null);
  });
});

describe("detectLeadAlerts", () => {
  it("raises one critical alert when everything stops", () => {
    const findings = detectLeadAlerts({
      total: series([...steady(8, 30), 0]),
      sources: [series([...steady(5, 30), 0], "lead_dashboard", "Website forms"), series([...steady(3, 30), 0], "calls", "Answered calls")],
      sensitivity: "normal",
    });
    expect(findings.map((f) => f.kind)).toEqual(["stopped"]);
    expect(findings[0].severity).toBe("critical");
  });

  it("flags one source stopping while others carry on", () => {
    const findings = detectLeadAlerts({
      total: series([...steady(8, 30), 3, 3]),
      sources: [series([...steady(5, 30), 0, 0], "lead_dashboard", "Website forms"), series([...steady(3, 30), 3, 3], "calls", "Answered calls")],
      sensitivity: "normal",
    });
    expect(findings.map((f) => `${f.kind}:${f.source}`)).toContain("source_stopped:lead_dashboard");
  });

  it("reports a source that isn't syncing instead of judging its zeros", () => {
    const findings = detectLeadAlerts({
      total: series([...steady(3, 30), 3]),
      sources: [series([...steady(5, 30), 0, 0], "ghl", "GoHighLevel", "the last sync failed (401)")],
      sensitivity: "normal",
    });
    expect(findings.map((f) => f.kind)).toEqual(["data_missing"]);
  });
});
