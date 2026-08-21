import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { openPhoneConnector } from "./index";
import type { PlatformAccount, DateRange } from "../types";

const account: PlatformAccount = {
  clientId: "client-1",
  clientTimezone: "America/New_York",
  platform: "openphone",
  externalId: "PN123",
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

describe("openPhoneConnector", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.OPENPHONE_FIXTURE;
    delete process.env.OPENPHONE_API_BASE_URL;
    delete process.env.OPENPHONE_API_KEY;
    vi.useRealTimers();
  });

  it("returns ok with normalized data, keeping missed and forwarded distinct", async () => {
    process.env.OPENPHONE_FIXTURE = "success.json";

    const result = await openPhoneConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.totalCalls).toBe(6);
    expect(result.data.missedCalls).toBe(3);
    expect(result.data.forwardedCalls).toBe(3);
    // Two of the three "missed" calls were actually forwarded — that
    // overlap must stay visible, not silently folded into missedCalls.
    expect(result.data.missedAndForwardedCalls).toBe(2);
    expect(result.data.totalDurationSeconds).toBe(555);
    expect(result.data.rangeStart).toBe("2026-08-18");
    expect(result.raw).toBeDefined();
  });

  it("returns no_data (not a zero) when there are no calls", async () => {
    process.env.OPENPHONE_FIXTURE = "empty.json";

    const result = await openPhoneConnector.fetch(account, range);

    expect(result.status).toBe("no_data");
    if (result.status !== "no_data") throw new Error("expected no_data");
    expect(result.raw).toBeDefined();
  });

  it("returns error (never a coerced value) on a malformed response", async () => {
    process.env.OPENPHONE_FIXTURE = "malformed.json";

    const result = await openPhoneConnector.fetch(account, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toBeTruthy();
  });

  it("returns error when the fixture file itself is missing", async () => {
    process.env.OPENPHONE_FIXTURE = "does-not-exist.json";

    const result = await openPhoneConnector.fetch(account, range);

    expect(result.status).toBe("error");
  });

  it("does not retry a 429 and returns error immediately", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.OPENPHONE_API_BASE_URL = "https://api.openphone.com/v1";
    process.env.OPENPHONE_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(429, { error: "rate limited" }));

    const result = await openPhoneConnector.fetch(account, range);

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with backoff and eventually returns error", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.OPENPHONE_API_BASE_URL = "https://api.openphone.com/v1";
    process.env.OPENPHONE_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(500));

    vi.useFakeTimers();
    const resultPromise = openPhoneConnector.fetch(account, range);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(4); // initial attempt + 3 retries
  });
});
