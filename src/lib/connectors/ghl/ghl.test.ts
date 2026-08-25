import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { ghlConnector } from "./index";
import type { PlatformAccount, DateRange } from "../types";

const account: PlatformAccount = {
  clientId: "client-1",
  clientTimezone: "America/New_York",
  platform: "ghl",
  externalId: "0kZ2SuULgx1e4t2h97fg",
  credentialLabel: "HILLVIEW",
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
    delete process.env.GHL_AGENCY_API_KEY__HILLVIEW;
    vi.useRealTimers();
  });

  it("returns ok with normalized data on a healthy response", async () => {
    process.env.GHL_FIXTURE = "success.json";

    const result = await ghlConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.leadCount).toBe(5);
    expect(result.data.opportunityValue).toBe(19000);
    // pipelineStageId, not a human-readable stage name — the real API has
    // no stageName field.
    expect(result.data.pipelineStages).toContainEqual({
      stage: "c26f0050-3bf3-4f71-bfb7-040fe1a4dd2e",
      count: 2,
    });
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

  it("errors when the mapping's credentialLabel has no matching key configured", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
    // Deliberately not setting GHL_AGENCY_API_KEY__HILLVIEW.

    const result = await ghlConnector.fetch(account, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toContain("GHL_AGENCY_API_KEY__HILLVIEW");
  });

  it("does not retry a 429 and returns error immediately", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
    process.env.GHL_AGENCY_API_KEY__HILLVIEW = "test-key";
    fetchMock.mockResolvedValue(mockResponse(429, { error: "rate limited" }));

    const result = await ghlConnector.fetch(account, range);

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with generous backoff and eventually returns error", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
    process.env.GHL_AGENCY_API_KEY__HILLVIEW = "test-key";
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

  it("follows startAfter/startAfterId across multiple pages", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
    process.env.GHL_AGENCY_API_KEY__HILLVIEW = "test-key";

    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `opp_${i}`,
      pipelineStageId: "c26f0050-3bf3-4f71-bfb7-040fe1a4dd2e",
      monetaryValue: 100,
    }));
    const page2 = [{ id: "opp_last", pipelineStageId: "da596195-00be-454c-9a36-31ec5f747e1f", monetaryValue: 50 }];

    fetchMock.mockImplementation((url: URL) => {
      if (!url.searchParams.get("startAfterId")) {
        return Promise.resolve(
          mockResponse(200, { opportunities: page1, meta: { startAfter: 111, startAfterId: "opp_99" } }),
        );
      }
      expect(url.searchParams.get("startAfterId")).toBe("opp_99");
      return Promise.resolve(mockResponse(200, { opportunities: page2, meta: { startAfterId: null } }));
    });

    const result = await ghlConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.leadCount).toBe(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ghlConnector.listAccounts", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.GHL_ACCOUNTS_FIXTURE;
    delete process.env.GHL_AGENCY_API_KEY__FIVE_STAR;
    delete process.env.GHL_AGENCY_API_KEY__HILLVIEW;
  });

  it("returns discovered manual-entry placeholders from the fixture", async () => {
    const result = await ghlConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0]).toEqual({
      id: "",
      name: "Enter the Acme Roofing location ID manually",
      credentialLabel: "ACME_ROOFING",
    });
  });

  it("returns error when the fixture file is missing", async () => {
    process.env.GHL_ACCOUNTS_FIXTURE = "does-not-exist.json";

    const result = await ghlConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns error when no credentials are configured", async () => {
    delete process.env.CONNECTOR_MODE;

    const result = await ghlConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("real branch: one placeholder per configured GHL_AGENCY_API_KEY__<LABEL>, no API call made", async () => {
    // GHL Private Integration tokens cannot list locations at all
    // (confirmed live) -- discovery never hits the network, it only
    // reads configured env vars.
    delete process.env.CONNECTOR_MODE;
    process.env.GHL_AGENCY_API_KEY__FIVE_STAR = "key-1";
    process.env.GHL_AGENCY_API_KEY__HILLVIEW = "key-2";
    fetchMock.mockReset();

    const result = await ghlConnector.listAccounts!();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.map((a) => a.credentialLabel).sort()).toEqual(["FIVE_STAR", "HILLVIEW"]);
    expect(result.accounts.every((a) => a.id === "")).toBe(true);
  });
});
