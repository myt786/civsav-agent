import { describe, expect, it } from "vitest";
import {
  aggregateCoverage,
  clientHealth,
  overviewReturn,
  pageNumber,
  queryHref,
  rowCoverage,
  selectIssues,
  selectPortfolio,
} from "./portfolio";
import type { ClientRow, DashboardData } from "./types";

const now = new Date("2026-09-07T12:00:00Z");
const ok = (value: number) => ({ kind: "ok" as const, value });
const missing = { kind: "no_data" as const };
function row(index: number, overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    clientId: String(index),
    clientName: `Client ${String(index).padStart(3, "0")}`,
    leads: ok(index),
    leadsDelta: { pct: null, direction: "unknown" },
    calls: { kind: "ok", value: { total: 10, missed: 0 } },
    spend: ok(index * 10),
    cpl: ok(10),
    sessions: ok(100),
    conversions: ok(5),
    avgPosition: ok(7),
    lastSyncedAt: now,
    staleHours: 1,
    ...overrides,
  };
}
function dataset(rows: ClientRow[]): DashboardData {
  return {
    generatedAt: now,
    rows,
    details: {},
    syncStatus: { lastRunAt: null, lastRunStatus: null, connectors: [] },
  };
}

describe("portfolio health and coverage", () => {
  it("uses existing flags, with critical taking priority over warnings", () => {
    const data = dataset([
      row(1, {
        leads: { kind: "error", message: "Access expired" },
        staleHours: 50,
      }),
    ]);
    const view = selectPortfolio(data, {});
    expect(view.items[0].health).toBe("critical");
    expect(view.items[0].flags[0].kind).toBe("sync_error");
    expect(view.attentionClients).toBe(1);
    expect(selectIssues(data, {}).issueCount).toBe(2);
  });
  it("does not mistake zero or an unverified value for missing data", () => {
    expect(clientHealth(row(0), [])).toBe("clear");
    expect(
      aggregateCoverage(
        [row(0), row(1, { leads: { kind: "unverified", value: 3 } })],
        "leads",
      ),
    ).toEqual({ value: 3, available: 2, total: 2, unverified: true });
  });
  it("keeps partial coverage visible without inventing a health score", () => {
    const partial = row(1, { sessions: missing, conversions: missing });
    expect(rowCoverage(partial)).toEqual({
      available: 4,
      total: 6,
      unverified: false,
    });
    expect(clientHealth(partial, [])).toBe("clear");
    expect(clientHealth(row(1, { lastSyncedAt: null }), [])).toBe(
      "insufficient",
    );
    expect(
      clientHealth(
        row(1, {
          leads: missing,
          calls: missing,
          spend: missing,
          sessions: missing,
          conversions: missing,
          avgPosition: missing,
        }),
        [],
      ),
    ).toBe("insufficient");
  });
  it("excludes unavailable and failed values from totals and reports their coverage", () => {
    const rows = [
      row(2),
      row(3, { spend: missing }),
      row(4, { spend: { kind: "error", message: "failed" } }),
    ];
    expect(aggregateCoverage(rows, "spend")).toEqual({
      value: 20,
      available: 1,
      total: 3,
      unverified: false,
    });
    expect(aggregateCoverage(rows.slice(1), "spend").value).toBeNull();
  });
});
describe("large portfolio navigation", () => {
  const data = dataset(
    Array.from({ length: 155 }, (_, i) =>
      row(
        i,
        i === 154
          ? { leads: { kind: "error", message: "Failed" } }
          : i === 100
            ? { staleHours: 50 }
            : {},
      ),
    ),
  );
  it("sorts before slicing, with global summary counts independent of page", () => {
    const first = selectPortfolio(data, {});
    const second = selectPortfolio(data, { page: "2" });
    expect(first.items).toHaveLength(25);
    expect(first.items[0].row.clientId).toBe("154");
    expect(first.items[1].row.clientId).toBe("100");
    expect(first.activeClients).toBe(155);
    expect(second.counts).toEqual(first.counts);
    expect(second.leads).toEqual(first.leads);
    expect(
      second.items.some((e) =>
        first.items.some((f) => e.row.clientId === f.row.clientId),
      ),
    ).toBe(false);
  });
  it("filters all clients rather than only the current page", () => {
    const view = selectPortfolio(data, {
      q: "client 154",
      health: "critical",
      page: "99",
    });
    expect(view.items.map((e) => e.row.clientId)).toEqual(["154"]);
    expect(view.page).toBe(1);
    expect(view.activeClients).toBe(155);
  });
  it("sorts numbers with unknown values last in either direction", () => {
    const small = dataset([row(1, { leads: missing }), row(0), row(3)]);
    expect(
      selectPortfolio(small, { sort: "leads", dir: "asc" }).items.map(
        (e) => e.row.clientId,
      ),
    ).toEqual(["0", "3", "1"]);
    expect(
      selectPortfolio(small, { sort: "leads", dir: "desc" }).items.map(
        (e) => e.row.clientId,
      ),
    ).toEqual(["3", "0", "1"]);
  });
  it("handles empty results and malformed query parameters", () => {
    expect(selectPortfolio(data, { q: "missing client" }).total).toBe(0);
    expect(
      selectPortfolio(data, { health: "nonsense", sort: "nonsense" }).total,
    ).toBe(155);
    for (const page of ["-1", "Infinity", "1.5", "abc"])
      expect(pageNumber({ page })).toBe(1);
    expect(selectPortfolio(data, { page: "999" }).page).toBe(7);
  });
  it("keeps search, health and sort when changing pages and safely returns to the overview", () => {
    const href = queryHref(
      "/",
      { q: "Blue & Green", health: "attention", sort: "spend" },
      { page: 2 },
    );
    expect(href).toBe("/?q=Blue+%26+Green&health=attention&sort=spend&page=2");
    expect(overviewReturn(href)).toBe(href);
    expect(overviewReturn("//example.com")).toBe("/");
    expect(overviewReturn("/settings")).toBe("/");
  });
  it("filters the issue queue while keeping portfolio issue totals", () => {
    const view = selectIssues(data, {
      severity: "warning",
      kind: "stale_sync",
      q: "100",
    });
    expect(view.items.map((f) => f.clientId)).toEqual(["100"]);
    expect(view.issueCount).toBe(2);
    expect(view.affectedClients).toBe(2);
  });
});
