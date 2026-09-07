import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { metaConnector } from "./index";
import type { PlatformAccount, DateRange } from "../types";

const account: PlatformAccount = {
  clientId: "client-1",
  clientTimezone: "America/New_York",
  platform: "meta",
  externalId: "act_1234567890",
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

describe("metaConnector", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.META_FIXTURE;
    delete process.env.META_GRAPH_API_BASE_URL;
    delete process.env.META_SYSTEM_USER_ACCESS_TOKEN;
    vi.useRealTimers();
  });

  it("returns ok with normalized data, summing string values as numbers", async () => {
    process.env.META_FIXTURE = "success.json";

    const result = await metaConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    // If spend were string-concatenated instead of summed, this would be
    // "312.10175.22" (as a NaN after Number()), not 487.32.
    expect(result.data.spend).toBeCloseTo(487.32);
    expect(result.data.impressions).toBe(18420);
    expect(result.data.clicks).toBe(312);
    expect(result.data.results).toBe(14);
    expect(result.data.cpl).toBeCloseTo(34.808571428571426);
    expect(result.data.deliveryStatus).toBe("ACTIVE");
    expect(result.data.attributionWindow).toBe("7d_click_1d_view");
    expect(result.data.rangeStart).toBe("2026-08-18");
    expect(result.raw).toBeDefined();
  });

  it("returns no_data (not a zero) when there are no insight rows", async () => {
    process.env.META_FIXTURE = "empty.json";

    const result = await metaConnector.fetch(account, range);

    expect(result.status).toBe("no_data");
    if (result.status !== "no_data") throw new Error("expected no_data");
    expect(result.raw).toBeDefined();
  });

  it("returns error (never a coerced value) on a malformed response", async () => {
    process.env.META_FIXTURE = "malformed.json";

    const result = await metaConnector.fetch(account, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toBeTruthy();
  });

  it("returns error when the fixture file itself is missing", async () => {
    process.env.META_FIXTURE = "does-not-exist.json";

    const result = await metaConnector.fetch(account, range);

    expect(result.status).toBe("error");
  });

  it("does not retry a 429 and returns error immediately", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.META_GRAPH_API_BASE_URL = "https://graph.facebook.com/v21.0";
    process.env.META_SYSTEM_USER_ACCESS_TOKEN = "test-token";
    fetchMock.mockResolvedValue(mockResponse(429, { error: "rate limited" }));

    const result = await metaConnector.fetch(account, range);

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with backoff and eventually returns error", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.META_GRAPH_API_BASE_URL = "https://graph.facebook.com/v21.0";
    process.env.META_SYSTEM_USER_ACCESS_TOKEN = "test-token";
    fetchMock.mockResolvedValue(mockResponse(500));

    vi.useFakeTimers();
    const resultPromise = metaConnector.fetch(account, range);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(4); // initial attempt + 3 retries
  });
});

describe("metaConnector.listAccounts", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.META_ACCOUNTS_FIXTURE;
    delete process.env.META_GRAPH_API_BASE_URL;
    delete process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  });

  it("returns discovered accounts with name/currency/status as the extra hint", async () => {
    const result = await metaConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(3);
    expect(result.accounts[0]).toEqual({ id: "act_1234567890", name: "Acme Roofing", extra: "USD · active" });
    expect(result.accounts[2].extra).toBe("USD · disabled");
  });

  it("returns error when the fixture file is missing", async () => {
    process.env.META_ACCOUNTS_FIXTURE = "does-not-exist.json";

    const result = await metaConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns a friendly access-denied message on 401/403, not a raw status code", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.META_GRAPH_API_BASE_URL = "https://graph.facebook.com/v21.0";
    process.env.META_SYSTEM_USER_ACCESS_TOKEN = "test-token";
    fetchMock.mockResolvedValue(mockResponse(403));

    const result = await metaConnector.listAccounts!();

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toMatch(/No access to Meta accounts/);
  });

  it("returns error when credentials aren't configured", async () => {
    delete process.env.CONNECTOR_MODE;

    const result = await metaConnector.listAccounts!();

    expect(result.status).toBe("error");
  });
});
