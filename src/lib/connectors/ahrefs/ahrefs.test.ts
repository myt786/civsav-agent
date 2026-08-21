import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { ahrefsConnector } from "./index";
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
    expect(result.data.domainRating).toBe(54);
    expect(result.data.trafficEstimate).toBe(18400);
    expect(result.data.keywordPositions).toEqual({ top3: 12, top10: 47, top100: 310 });
    expect(result.data.rangeStart).toBe("2026-08-18");
    expect(result.raw).toBeDefined();
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
