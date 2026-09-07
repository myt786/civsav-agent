import { describe, expect, it } from "vitest";
import { computeAttentionFlags, computeForecast } from "./rules";
import type { ClientDetail, ClientRow, DailyPoint, DashboardData } from "../dashboard/types";

function okCell(value: number) {
  return { kind: "ok" as const, value };
}

function noData() {
  return { kind: "no_data" as const };
}

function baseRow(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    clientId: "c1",
    clientName: "Acme Roofing",
    leads: okCell(20),
    leadsDelta: { pct: 0, direction: "flat" },
    calls: { kind: "ok", value: { total: 10, missed: 1 } },
    spend: okCell(500),
    cpl: okCell(25),
    sessions: okCell(300),
    conversions: okCell(15),
    avgPosition: okCell(8),
    lastSyncedAt: new Date("2026-08-31T00:00:00Z"),
    staleHours: 2,
    ...overrides,
  };
}

// Small, steady noise (values close to 5) to use as a 13-day baseline —
// long enough to clear MIN_BASELINE_DAYS, varied enough for a real
// (non-zero) standard deviation.
const BASELINE_NOISE_AROUND_5 = [5, 5.2, 4.8, 5.1, 4.9, 5, 5.2, 4.8, 5, 5.1, 4.9, 5, 5.1];

function seriesFromValues(values: number[]): DailyPoint[] {
  return values.map((value, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, value }));
}

function dataWith(row: ClientRow, detail?: Partial<ClientDetail>): DashboardData {
  return {
    generatedAt: new Date("2026-08-31T00:00:00Z"),
    syncStatus: { lastRunAt: null, lastRunStatus: null, connectors: [] },
    rows: [row],
    details: {
      [row.clientId]: {
        clientId: row.clientId,
        sparklines: [],
        breakdown: [],
        ...detail,
      },
    },
  };
}

describe("computeAttentionFlags", () => {
  it("flags no problems for a healthy row", () => {
    const flags = computeAttentionFlags(dataWith(baseRow()));
    expect(flags).toEqual([]);
  });

  it("flags a sync error as critical, carrying the failure message", () => {
    const row = baseRow({ leads: { kind: "error", message: "401 unauthorized" } });
    const flags = computeAttentionFlags(dataWith(row));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: "sync_error", severity: "critical" });
    expect(flags[0].message).toContain("401 unauthorized");
  });

  it("flags a stale sync past the threshold", () => {
    const row = baseRow({ staleHours: 40 });
    const flags = computeAttentionFlags(dataWith(row));
    expect(flags.some((f) => f.kind === "stale_sync")).toBe(true);
  });

  it("does not flag a sync just under the stale threshold", () => {
    const row = baseRow({ staleHours: 36 });
    const flags = computeAttentionFlags(dataWith(row));
    expect(flags.some((f) => f.kind === "stale_sync")).toBe(false);
  });

  it("flags leads trending down", () => {
    const row = baseRow({ leadsDelta: { pct: -20, direction: "down" } });
    const flags = computeAttentionFlags(dataWith(row));
    expect(flags.some((f) => f.kind === "leads_down")).toBe(true);
  });

  it("does not flag leads down when the delta is unknown (no prior baseline)", () => {
    const row = baseRow({ leads: noData(), leadsDelta: { pct: null, direction: "unknown" } });
    const flags = computeAttentionFlags(dataWith(row));
    expect(flags.some((f) => f.kind === "leads_down")).toBe(false);
  });

  it("flags a high missed-call rate above the volume floor", () => {
    const row = baseRow({ calls: { kind: "ok", value: { total: 10, missed: 4 } } });
    const flags = computeAttentionFlags(dataWith(row));
    expect(flags.some((f) => f.kind === "missed_calls_high")).toBe(true);
  });

  it("ignores a high missed-call rate on too little volume to be meaningful", () => {
    const row = baseRow({ calls: { kind: "ok", value: { total: 2, missed: 2 } } });
    const flags = computeAttentionFlags(dataWith(row));
    expect(flags.some((f) => f.kind === "missed_calls_high")).toBe(false);
  });

  it("flags average search position as a statistically real step worse than its baseline", () => {
    // 13 noisy-but-steady baseline days around 5, then a clean step to 9
    // for the most recent 7 (WINDOW_DAYS) — a real regime change, not noise.
    const points = seriesFromValues([
      ...BASELINE_NOISE_AROUND_5,
      9, 9, 9, 9, 9, 9, 9,
    ]);
    const data = dataWith(baseRow(), { sparklines: [{ key: "avgPosition", label: "Avg. position", points }] });
    const flags = computeAttentionFlags(data);
    expect(flags.some((f) => f.kind === "position_worsening")).toBe(true);
  });

  it("does not flag ordinary week-to-week noise around a steady position", () => {
    const points = seriesFromValues([...BASELINE_NOISE_AROUND_5, 5.1, 4.9, 5.2, 4.8, 5, 5.1, 4.9]);
    const data = dataWith(baseRow(), { sparklines: [{ key: "avgPosition", label: "Avg. position", points }] });
    const flags = computeAttentionFlags(data);
    expect(flags.some((f) => f.kind === "position_worsening")).toBe(false);
  });

  it("does not flag an improving (lower) position even if it moved a lot", () => {
    const points = seriesFromValues([...BASELINE_NOISE_AROUND_5, 1, 1, 1, 1, 1, 1, 1]);
    const data = dataWith(baseRow(), { sparklines: [{ key: "avgPosition", label: "Avg. position", points }] });
    const flags = computeAttentionFlags(data);
    expect(flags.some((f) => f.kind === "position_worsening")).toBe(false);
  });

  it("does not flag position with too little baseline history to judge", () => {
    const points = seriesFromValues([5, 5, 9, 9, 9, 9, 9]);
    const data = dataWith(baseRow(), { sparklines: [{ key: "avgPosition", label: "Avg. position", points }] });
    const flags = computeAttentionFlags(data);
    expect(flags.some((f) => f.kind === "position_worsening")).toBe(false);
  });

  it("flags a real spend spike above its own baseline", () => {
    const points = seriesFromValues([
      ...BASELINE_NOISE_AROUND_5.map((v) => v * 100), // ~$500/day baseline
      1500, 1500, 1500, 1500, 1500, 1500, 1500,
    ]);
    const data = dataWith(baseRow(), { sparklines: [{ key: "spend", label: "Spend", points }] });
    const flags = computeAttentionFlags(data);
    expect(flags.some((f) => f.kind === "spend_spike")).toBe(true);
  });

  it("does not flag spend that dropped, only spend that spiked", () => {
    const points = seriesFromValues([...BASELINE_NOISE_AROUND_5.map((v) => v * 100), 50, 50, 50, 50, 50, 50, 50]);
    const data = dataWith(baseRow(), { sparklines: [{ key: "spend", label: "Spend", points }] });
    const flags = computeAttentionFlags(data);
    expect(flags.some((f) => f.kind === "spend_spike")).toBe(false);
  });

  it("flags a real sessions drop below its own baseline", () => {
    const points = seriesFromValues([
      ...BASELINE_NOISE_AROUND_5.map((v) => v * 100), // ~$500/day baseline
      50, 50, 50, 50, 50, 50, 50,
    ]);
    const data = dataWith(baseRow(), { sparklines: [{ key: "sessions", label: "Sessions", points }] });
    const flags = computeAttentionFlags(data);
    expect(flags.some((f) => f.kind === "sessions_drop")).toBe(true);
  });

  it("does not flag sessions that rose, only sessions that dropped", () => {
    const points = seriesFromValues([...BASELINE_NOISE_AROUND_5.map((v) => v * 100), 1500, 1500, 1500, 1500, 1500, 1500, 1500]);
    const data = dataWith(baseRow(), { sparklines: [{ key: "sessions", label: "Sessions", points }] });
    const flags = computeAttentionFlags(data);
    expect(flags.some((f) => f.kind === "sessions_drop")).toBe(false);
  });
});

describe("computeForecast", () => {
  it("returns no forecast with fewer than 5 known days", () => {
    const points: DailyPoint[] = [
      { date: "2026-08-01", value: 10 },
      { date: "2026-08-02", value: 12 },
      { date: "2026-08-03", value: null },
    ];
    const result = computeForecast("leads", "Leads", "count", points, 7, 5);
    expect(result.forecast).toEqual([]);
    expect(result.trend).toBe("unknown");
  });

  it("projects forward along a clear upward trend", () => {
    const points: DailyPoint[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      value: 10 + i * 2,
    }));
    const result = computeForecast("leads", "Leads", "count", points, 3, 5);
    expect(result.trend).toBe("up");
    expect(result.forecast).toHaveLength(3);
    // Each projected point should keep climbing, never go negative.
    for (const p of result.forecast) {
      expect(p.value).toBeGreaterThanOrEqual(0);
    }
    expect(result.forecast[2].value).toBeGreaterThan(result.forecast[0].value);
  });

  it("never projects a negative value even on a steep downward trend", () => {
    const points: DailyPoint[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      value: Math.max(0, 5 - i),
    }));
    const result = computeForecast("leads", "Leads", "count", points, 5, 5);
    for (const p of result.forecast) {
      expect(p.value).toBeGreaterThanOrEqual(0);
    }
  });

  it("treats a near-flat slope as flat, not up or down", () => {
    const points: DailyPoint[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      value: 50 + (i % 2 === 0 ? 1 : -1),
    }));
    const result = computeForecast("leads", "Leads", "count", points, 3, 5);
    expect(result.trend).toBe("flat");
  });
});
