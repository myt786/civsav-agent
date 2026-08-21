import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { leadDashboardConnector } from "./index";
import type { PlatformAccount, DateRange } from "../types";

const account: PlatformAccount = {
  clientId: "client-1",
  clientTimezone: "America/New_York",
  platform: "lead_dashboard",
  externalId: "location-123",
};

const range: DateRange = {
  start: new Date("2026-08-19T00:00:00Z"),
  end: new Date("2026-08-21T23:59:59Z"),
};

describe("leadDashboardConnector", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.LEAD_DASHBOARD_FIXTURE;
  });

  it("returns ok with normalized data on a healthy response", async () => {
    process.env.LEAD_DASHBOARD_FIXTURE = "success.json";

    const result = await leadDashboardConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.totalLeads).toBe(6);
    expect(result.data.byStatus).toEqual({
      new: 2,
      contacted: 1,
      qualified: 1,
      won: 1,
      lost: 1,
    });
    expect(result.data.rangeStart).toBe("2026-08-18");
    expect(result.raw).toBeDefined();
  });

  it("returns no_data (not a zero) when the API returns an empty list", async () => {
    process.env.LEAD_DASHBOARD_FIXTURE = "empty.json";

    const result = await leadDashboardConnector.fetch(account, range);

    expect(result.status).toBe("no_data");
    if (result.status !== "no_data") throw new Error("expected no_data");
    expect(result.raw).toBeDefined();
  });

  it("returns error (never a coerced value) on a malformed response", async () => {
    process.env.LEAD_DASHBOARD_FIXTURE = "malformed.json";

    const result = await leadDashboardConnector.fetch(account, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toBeTruthy();
  });

  it("returns error when the fixture file itself is missing", async () => {
    process.env.LEAD_DASHBOARD_FIXTURE = "does-not-exist.json";

    const result = await leadDashboardConnector.fetch(account, range);

    expect(result.status).toBe("error");
  });
});
