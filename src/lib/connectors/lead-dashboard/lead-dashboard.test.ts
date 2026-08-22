import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { leadDashboardConnector } from "./index";
import type { PlatformAccount, DateRange } from "../types";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function mockResponse(status: number, body: unknown = {}) {
  return {
    ok: status < 400,
    status,
    statusText: `Status ${status}`,
    json: async () => body,
  } as Response;
}

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

describe("leadDashboardConnector.listAccounts", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.LEAD_DASHBOARD_ACCOUNTS_FIXTURE;
    delete process.env.LEAD_DASHBOARD_API_BASE_URL;
    delete process.env.LEAD_DASHBOARD_API_KEY;
  });

  it("returns discovered clients from the fixture", async () => {
    const result = await leadDashboardConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(3);
    expect(result.accounts[0]).toEqual({ id: "location-a1b2c3d4", name: "Acme Roofing" });
  });

  it("returns error when the fixture file is missing", async () => {
    process.env.LEAD_DASHBOARD_ACCOUNTS_FIXTURE = "does-not-exist.json";

    const result = await leadDashboardConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns a friendly access-denied message on 401/403, not a raw status code", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.LEAD_DASHBOARD_API_BASE_URL = "https://api.leaddashboard.test";
    process.env.LEAD_DASHBOARD_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(403));

    const result = await leadDashboardConnector.listAccounts!();

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toMatch(/No access to the lead dashboard client list/);
  });

  it("returns error when credentials aren't configured", async () => {
    delete process.env.CONNECTOR_MODE;

    const result = await leadDashboardConnector.listAccounts!();

    expect(result.status).toBe("error");
  });
});
