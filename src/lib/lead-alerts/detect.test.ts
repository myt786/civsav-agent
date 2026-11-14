import { describe, expect, it } from "vitest";
import { checkDrop, checkStopped, detectLeadAlerts, isRecovered, type DayValue, type LeadSeries } from "./detect";

// Daily values ending yesterday, Thursday 2026-11-12.
const END = "2026-11-12";
function series(values: (number | null)[], source = "total", label = "All leads", dataProblem: string | null = null): LeadSeries {
  const end = Date.parse(`${END}T12:00:00Z`);
  const days: DayValue[] = values.map((value, i) => ({
    date: new Date(end - (values.length - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
  return { source, label, days, dataProblem };
}

const steady = (perDay: number, n: number) => Array.from({ length: n }, () => perDay);
// Weekdays only: n days ending on a Wednesday (so yesterday, Thursday, comes next).
const weekdaysOnly = (perDay: number, weeks: number) => {
  const out: number[] = [];
  // Ends Wed 2026-11-11 → the pattern from Thursday 8 weeks back.
  const start = Date.parse("2026-11-11T12:00:00Z") - (weeks * 7 - 1) * 86_400_000;
  for (let i = 0; i < weeks * 7; i++) {
    const wd = new Date(start + i * 86_400_000).getUTCDay();
    out.push(wd === 0 || wd === 6 ? 0 : perDay);
  }
  return out;
};

describe("checkStopped", () => {
  it("fires after one empty day for a busy client", () => {
    expect(checkStopped(series([...steady(8, 40), 0]), "normal")).toMatchObject({ emptyDays: 1 });
  });

  it("waits longer for a quieter client", () => {
    // 2 a day: 3 empty days = 6 < 6.9, 4 = 8.
    expect(checkStopped(series([...steady(2, 40), 0, 0, 0]), "normal")).toBe(null);
    expect(checkStopped(series([...steady(2, 40), 0, 0, 0, 0]), "normal")).toMatchObject({ emptyDays: 4 });
  });

  it("ignores normally empty weekends", () => {
    // Leads only on weekdays; Sat + Sun empty then Monday... here: a
    // weekday-only client with an empty weekend is not "stopped".
    const s = series([...weekdaysOnly(5, 6), 5]);
    const weekend = { ...s, days: [...s.days.slice(0, -1), { date: "2026-11-14", value: 0 }, { date: "2026-11-15", value: 0 }] };
    expect(checkStopped(weekend, "normal")).toBe(null);
  });

  it("only counts the afternoon when yesterday was empty too", () => {
    const busy = series([...steady(8, 40), 5]);
    expect(checkStopped(busy, "normal", { value: 0, fraction: 0.6 }, "2026-11-13")).toBe(null);
    const yesterdayEmpty = series([...steady(5, 40), 0]);
    // 5 (yesterday) < 6.9 alone; + 0.6 × 5 today = 8.
    expect(checkStopped(yesterdayEmpty, "normal")).toBe(null);
    expect(checkStopped(yesterdayEmpty, "normal", { value: 0, fraction: 0.6 }, "2026-11-13")).toMatchObject({ emptyDays: 1.6 });
    expect(checkStopped(yesterdayEmpty, "normal", { value: 1, fraction: 0.6 }, "2026-11-13")).toBe(null);
  });

  it("needs enough history and volume", () => {
    expect(checkStopped(series([...steady(8, 15), 0, 0]), "normal")).toBe(null);
    expect(checkStopped(series([...steady(0.4, 40), 0, 0, 0, 0, 0, 0, 0]), "high")).toBe(null);
  });
});

describe("isRecovered", () => {
  it("needs half a normal day, not one stray lead", () => {
    expect(isRecovered(series([...steady(8, 40), 0, 1]))).toBe(false);
    expect(isRecovered(series([...steady(8, 40), 0, 4]))).toBe(true);
    expect(isRecovered(series([...steady(8, 40), 0]), { value: 3, fraction: 0.5 }, "2026-11-13")).toBe(true);
  });
});

describe("checkDrop", () => {
  it("compares the last 3 days with the same weekdays", () => {
    expect(checkDrop(series([...steady(5, 28), 1, 1, 1]), "normal")).toEqual({ expected: 15, actual: 3 });
    expect(checkDrop(series([...steady(5, 28), 3, 3, 3]), "normal")).toBe(null);
  });

  it("ignores small clients", () => {
    expect(checkDrop(series([...steady(2, 28), 0, 0, 1]), "normal")).toBe(null);
  });
});

describe("detectLeadAlerts", () => {
  it("raises one critical alert when everything stops", () => {
    const findings = detectLeadAlerts({
      total: series([...steady(10, 40), 0]),
      sources: [series([...steady(6, 40), 0], "lead_dashboard", "Website forms"), series([...steady(4, 40), 0], "calls", "Answered calls")],
      sensitivity: "normal",
    });
    expect(findings.map((f) => f.kind)).toEqual(["stopped"]);
    expect(findings[0].severity).toBe("critical");
  });

  it("flags one source stopping while others carry on", () => {
    const findings = detectLeadAlerts({
      total: series([...steady(10, 40), 4, 4]),
      sources: [series([...steady(6, 40), 0, 0], "lead_dashboard", "Website forms"), series([...steady(4, 40), 4, 4], "calls", "Answered calls")],
      sensitivity: "normal",
    });
    expect(findings.map((f) => `${f.kind}:${f.source}`)).toContain("source_stopped:lead_dashboard");
  });

  it("reports a source that isn't syncing instead of judging its zeros", () => {
    const findings = detectLeadAlerts({
      total: series([...steady(3, 40), 3]),
      sources: [series([...steady(5, 40), 0, 0], "ghl", "GoHighLevel", "the last sync failed (401)")],
      sensitivity: "normal",
    });
    expect(findings.map((f) => f.kind)).toEqual(["data_missing"]);
  });
});
