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
  externalId: "1",
};

const range: DateRange = {
  start: new Date("2026-08-19T00:00:00Z"),
  end: new Date("2026-08-21T23:59:59Z"),
};

describe("leadDashboardConnector", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.LEAD_DASHBOARD_FIXTURE;
    delete process.env.LEAD_DASHBOARD_API_BASE_URL;
    delete process.env.LEAD_DASHBOARD_API_KEY;
  });

  it("returns ok with normalized data on a healthy response", async () => {
    process.env.LEAD_DASHBOARD_FIXTURE = "success.json";

    const result = await leadDashboardConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.totalLeads).toBe(7);
    expect(result.data.byStatus).toEqual({ completed: 5, abandoned: 2 });
    // A null is_spam (not yet classified) is never counted as spam —
    // only a strict `true` is.
    expect(result.data.spamLeads).toBe(1);
    expect(result.data.rangeStart).toBe("2026-08-18");
    expect(result.raw).toBeDefined();
  });

  it("includes a zero count for a status that did not occur that day, not a missing key", async () => {
    // leadDashboardDataSchema's byStatus is a Zod record keyed by the
    // status enum, which requires every enum key present — a day with
    // only "completed" leads must still report abandoned: 0, or the
    // normalized-data validation itself fails.
    process.env.LEAD_DASHBOARD_FIXTURE = "all-one-status.json";

    const result = await leadDashboardConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.byStatus).toEqual({ completed: 2, abandoned: 0 });
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

  it("does not retry a 429 and returns error immediately", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.LEAD_DASHBOARD_API_BASE_URL = "https://leaman.civsav.com";
    process.env.LEAD_DASHBOARD_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(429, { message: "rate limited" }));

    const result = await leadDashboardConnector.fetch(account, range);

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with backoff and eventually returns error", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.LEAD_DASHBOARD_API_BASE_URL = "https://leaman.civsav.com";
    process.env.LEAD_DASHBOARD_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(500));

    vi.useFakeTimers();
    const resultPromise = leadDashboardConnector.fetch(account, range);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    vi.useRealTimers();

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(4); // initial attempt + 3 retries
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

  it("returns discovered sites from the fixture", async () => {
    const result = await leadDashboardConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(3);
    expect(result.accounts[0]).toEqual({ id: "1", name: "Acme Roofing" });
  });

  it("returns error when the fixture file is missing", async () => {
    process.env.LEAD_DASHBOARD_ACCOUNTS_FIXTURE = "does-not-exist.json";

    const result = await leadDashboardConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns a friendly access-denied message on 401/403, not a raw status code", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.LEAD_DASHBOARD_API_BASE_URL = "https://leaman.civsav.com";
    process.env.LEAD_DASHBOARD_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(403));

    const result = await leadDashboardConnector.listAccounts!();

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toMatch(/No access to the lead dashboard site list/);
  });

  it("returns error when credentials aren't configured", async () => {
    delete process.env.CONNECTOR_MODE;

    const result = await leadDashboardConnector.listAccounts!();

    expect(result.status).toBe("error");
  });
});
