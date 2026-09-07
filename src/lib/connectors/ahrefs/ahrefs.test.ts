import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { ahrefsConnector } from "./index";
import { centsToUsd } from "./schema";
import type { PlatformAccount, DateRange } from "../types";

const account: PlatformAccount = {
  clientId: "client-1",
  clientTimezone: "America/New_York",
  platform: "ahrefs",
  externalId: "example.com",
};

const range: DateRange = {
  start: new Date("2026-08-19T00:00:00Z"),
  end: new Date("2026-08-21T23:59:59Z"),
};

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

describe("centsToUsd", () => {
  it("divides by 100 to convert cents to dollars", () => {
    expect(centsToUsd(4447)).toBe(44.47);
    expect(centsToUsd(100)).toBe(1);
    expect(centsToUsd(0)).toBe(0);
  });
});

describe("ahrefsConnector", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.AHREFS_FIXTURE;
    delete process.env.AHREFS_API_BASE_URL;
    delete process.env.AHREFS_API_TOKEN;
    vi.useRealTimers();
  });

  it("returns ok with normalized summary data on a healthy response", async () => {
    process.env.AHREFS_FIXTURE = "success.json";

    const result = await ahrefsConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.organicKeywords).toBe(16);
    expect(result.data.organicKeywordsTop3).toBe(4);
    expect(result.data.organicTrafficEstimate).toBe(37);
    expect(result.data.organicCostValue).toBe(44.47);
    expect(result.data.paidKeywords).toBe(4);
    expect(result.data.paidTrafficEstimate).toBe(8);
    expect(result.data.paidCostValue).toBe(2.99);
    expect(result.data.paidPages).toBe(6);
    // range.end is used (a single-day snapshot) — 2026-08-21T23:59:59Z is
    // still 2026-08-21 in America/New_York.
    expect(result.data.rangeStart).toBe("2026-08-21");
    expect(result.data.rangeEnd).toBe("2026-08-21");
    expect(result.raw).toBeDefined();
  });

  it("treats a null paid_cost (no cost estimate for that side of traffic) as zero, not an error", async () => {
    process.env.AHREFS_FIXTURE = "null-cost.json";

    const result = await ahrefsConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.organicCostValue).toBe(102.39);
    expect(result.data.paidCostValue).toBe(0);
  });

  it("returns no_data (not a zero) when Ahrefs has no crawl data for the domain", async () => {
    process.env.AHREFS_FIXTURE = "empty.json";

    const result = await ahrefsConnector.fetch(account, range);

    expect(result.status).toBe("no_data");
    if (result.status !== "no_data") throw new Error("expected no_data");
    expect(result.raw).toBeDefined();
  });

  it("returns error (never a coerced value) on a malformed response", async () => {
    process.env.AHREFS_FIXTURE = "malformed.json";

    const result = await ahrefsConnector.fetch(account, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toBeTruthy();
  });

  it("returns error when the fixture file itself is missing", async () => {
    process.env.AHREFS_FIXTURE = "does-not-exist.json";

    const result = await ahrefsConnector.fetch(account, range);

    expect(result.status).toBe("error");
  });

  it("does not retry a 429 and returns error immediately", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.AHREFS_API_BASE_URL = "https://api.ahrefs.com/v3";
    process.env.AHREFS_API_TOKEN = "test-token";
    fetchMock.mockResolvedValue(mockResponse(429, { error: "quota exceeded" }));

    const result = await ahrefsConnector.fetch(account, range);

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with backoff and eventually returns error", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.AHREFS_API_BASE_URL = "https://api.ahrefs.com/v3";
    process.env.AHREFS_API_TOKEN = "test-token";
    fetchMock.mockResolvedValue(mockResponse(500));

    vi.useFakeTimers();
    const resultPromise = ahrefsConnector.fetch(account, range);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(4); // initial attempt + 3 retries
  });
});

describe("ahrefsConnector.listAccounts", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.AHREFS_ACCOUNTS_FIXTURE;
    delete process.env.AHREFS_API_BASE_URL;
    delete process.env.AHREFS_API_TOKEN;
  });

  it("maps each project's url (trailing slash stripped) as the id, project_name as the label", async () => {
    const result = await ahrefsConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(3);
    expect(result.accounts[0]).toEqual({ id: "acmeroofing.com", name: "Acme Roofing", extra: undefined });
    expect(result.accounts[1]).toEqual({ id: "blueridgedental.com", name: "Blue Ridge Dental", extra: undefined });
    expect(result.accounts[2]).toEqual({ id: "coastalhvac.com", name: "Coastal HVAC", extra: "not verified in Ahrefs" });
  });

  it("returns error when the fixture file is missing", async () => {
    process.env.AHREFS_ACCOUNTS_FIXTURE = "does-not-exist.json";

    const result = await ahrefsConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns a friendly access-denied message on 401/403, not a raw status code", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.AHREFS_API_BASE_URL = "https://api.ahrefs.com/v3";
    process.env.AHREFS_API_TOKEN = "test-token";
    fetchMock.mockResolvedValue(mockResponse(403));

    const result = await ahrefsConnector.listAccounts!();

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toMatch(/No access to Ahrefs projects/);
  });

  it("returns error when credentials aren't configured", async () => {
    delete process.env.CONNECTOR_MODE;

    const result = await ahrefsConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("goes live on real credentials even when CONNECTOR_MODE is still 'fixture'", async () => {
    // Unlike fetchSummary (metered, stays fixture-gated), listing projects
    // is cheap enough that a real token takes discovery live on its own —
    // someone who's wired up Ahrefs shouldn't have to flip every other
    // connector's dev safety net off just to see their real projects here.
    process.env.AHREFS_API_BASE_URL = "https://api.ahrefs.com/v3";
    process.env.AHREFS_API_TOKEN = "test-token";
    fetchMock.mockResolvedValue(
      mockResponse(200, {
        projects: [{ project_id: "1", project_name: "Real Co", url: "real.co/", verified: true }],
      }),
    );

    const result = await ahrefsConnector.listAccounts!();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].toString()).toContain("/management/projects");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toEqual([{ id: "real.co", name: "Real Co", extra: undefined }]);
  });
});
