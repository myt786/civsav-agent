import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { ghlConnector } from "./index";
import type { PlatformAccount, DateRange } from "../types";

const account: PlatformAccount = {
  clientId: "client-1",
  clientTimezone: "America/New_York",
  platform: "ghl",
  externalId: "location-abc123",
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

describe("ghlConnector", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.GHL_FIXTURE;
    delete process.env.GHL_API_BASE_URL;
    delete process.env.GHL_AGENCY_API_KEY;
    vi.useRealTimers();
  });

  it("returns ok with normalized data on a healthy response", async () => {
    process.env.GHL_FIXTURE = "success.json";

    const result = await ghlConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.leadCount).toBe(5);
    expect(result.data.opportunityValue).toBe(19000);
    expect(result.data.pipelineStages).toContainEqual({ stage: "New Lead", count: 2 });
    expect(result.data.pipelineStages).toContainEqual({ stage: "Won", count: 1 });
    expect(result.data.rangeStart).toBe("2026-08-18");
    expect(result.raw).toBeDefined();
  });

  it("returns no_data (not a zero) when there are no opportunities", async () => {
    process.env.GHL_FIXTURE = "empty.json";

    const result = await ghlConnector.fetch(account, range);

    expect(result.status).toBe("no_data");
    if (result.status !== "no_data") throw new Error("expected no_data");
    expect(result.raw).toBeDefined();
  });

  it("returns error (never a coerced value) on a malformed response", async () => {
    process.env.GHL_FIXTURE = "malformed.json";

    const result = await ghlConnector.fetch(account, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toBeTruthy();
  });

  it("returns error when the fixture file itself is missing", async () => {
    process.env.GHL_FIXTURE = "does-not-exist.json";

    const result = await ghlConnector.fetch(account, range);

    expect(result.status).toBe("error");
  });

  it("does not retry a 429 and returns error immediately", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
    process.env.GHL_AGENCY_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(429, { error: "rate limited" }));

    const result = await ghlConnector.fetch(account, range);

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with generous backoff and eventually returns error", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
    process.env.GHL_AGENCY_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(500));

    vi.useFakeTimers();
    const resultPromise = ghlConnector.fetch(account, range);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("error");
    // Tighter rate limits mean more generous retries here than other
    // connectors: 5 retries configured, so 6 attempts total.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe("ghlConnector.listAccounts", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.GHL_ACCOUNTS_FIXTURE;
    delete process.env.GHL_API_BASE_URL;
    delete process.env.GHL_AGENCY_API_KEY;
  });

  it("returns discovered locations from the fixture", async () => {
    const result = await ghlConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(3);
    expect(result.accounts[0]).toEqual({ id: "loc_acme001", name: "Acme Roofing" });
  });

  it("returns error when the fixture file is missing", async () => {
    process.env.GHL_ACCOUNTS_FIXTURE = "does-not-exist.json";

    const result = await ghlConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns a friendly access-denied message on 401/403, not a raw status code", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
    process.env.GHL_AGENCY_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(403));

    const result = await ghlConnector.listAccounts!();

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toMatch(/No access to GoHighLevel locations/);
  });

  it("returns error when credentials aren't configured", async () => {
    delete process.env.CONNECTOR_MODE;

    const result = await ghlConnector.listAccounts!();

    expect(result.status).toBe("error");
  });
});
