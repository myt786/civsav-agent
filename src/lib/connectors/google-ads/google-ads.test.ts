import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const { reportMock, queryMock, customerMock, googleAdsApiMock } = vi.hoisted(() => {
  const reportMock = vi.fn();
  const queryMock = vi.fn();
  const customerMock = vi.fn(() => ({ report: reportMock, query: queryMock }));
  // GoogleAdsApi is called with `new` in client.ts, so its mock implementation
  // must be a real function — an arrow function can't be constructed.
  const googleAdsApiMock = vi.fn(function GoogleAdsApiMock() {
    return { Customer: customerMock };
  });
  return { reportMock, queryMock, customerMock, googleAdsApiMock };
});

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: googleAdsApiMock,
}));

import { googleAdsConnector } from "./index";
import { microsToCurrency } from "./schema";
import type { PlatformAccount, DateRange } from "../types";

const account: PlatformAccount = {
  clientId: "client-1",
  clientTimezone: "America/New_York",
  platform: "google_ads",
  externalId: "1234567890",
};

const range: DateRange = {
  start: new Date("2026-08-19T00:00:00Z"),
  end: new Date("2026-08-21T23:59:59Z"),
};

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

describe("microsToCurrency", () => {
  it("divides by 1,000,000 to convert micros to currency", () => {
    expect(microsToCurrency(1_000_000)).toBe(1);
    expect(microsToCurrency(187_450_000)).toBe(187.45);
    expect(microsToCurrency(0)).toBe(0);
  });
});

describe("googleAdsConnector", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    reportMock.mockReset();
    customerMock.mockReset();
    customerMock.mockReturnValue({ report: reportMock, query: queryMock });
    googleAdsApiMock.mockReset();
    googleAdsApiMock.mockImplementation(function GoogleAdsApiMock() {
      return { Customer: customerMock };
    });
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.GOOGLE_ADS_FIXTURE;
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    delete process.env.GOOGLE_ADS_CLIENT_ID;
    delete process.env.GOOGLE_ADS_CLIENT_SECRET;
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;
    vi.useRealTimers();
  });

  it("returns ok with normalized data on a healthy response", async () => {
    process.env.GOOGLE_ADS_FIXTURE = "success.json";

    const result = await googleAdsConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.impressions).toBe(7950);
    expect(result.data.clicks).toBe(295);
    expect(result.data.cost).toBe(187.45);
    expect(result.data.conversions).toBe(12);
    expect(result.data.cpl).toBeCloseTo(15.620833333333334);
    expect(result.data.rangeStart).toBe("2026-08-18");
    expect(result.raw).toBeDefined();
  });

  it("returns no_data (not a zero) when the API returns no rows", async () => {
    process.env.GOOGLE_ADS_FIXTURE = "empty.json";

    const result = await googleAdsConnector.fetch(account, range);

    expect(result.status).toBe("no_data");
    if (result.status !== "no_data") throw new Error("expected no_data");
    expect(result.raw).toBeDefined();
  });

  it("returns error (never a coerced value) on a malformed response", async () => {
    process.env.GOOGLE_ADS_FIXTURE = "malformed.json";

    const result = await googleAdsConnector.fetch(account, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toBeTruthy();
  });

  it("returns error when the fixture file itself is missing", async () => {
    process.env.GOOGLE_ADS_FIXTURE = "does-not-exist.json";

    const result = await googleAdsConnector.fetch(account, range);

    expect(result.status).toBe("error");
  });

  it("does not retry a 429 and returns error immediately", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    process.env.GOOGLE_ADS_CLIENT_ID = "client-id";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_ADS_REFRESH_TOKEN = "refresh-token";
    reportMock.mockRejectedValue(httpError(429, "429 Too Many Requests"));

    const result = await googleAdsConnector.fetch(account, range);

    expect(result.status).toBe("error");
    expect(reportMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with backoff and eventually returns error", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    process.env.GOOGLE_ADS_CLIENT_ID = "client-id";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_ADS_REFRESH_TOKEN = "refresh-token";
    reportMock.mockRejectedValue(httpError(500, "500 Internal Server Error"));

    vi.useFakeTimers();
    const resultPromise = googleAdsConnector.fetch(account, range);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("error");
    expect(reportMock).toHaveBeenCalledTimes(4); // initial attempt + 3 retries
  });
});

describe("googleAdsConnector.listAccounts", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    queryMock.mockReset();
    customerMock.mockReturnValue({ report: reportMock, query: queryMock });
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.GOOGLE_ADS_ACCOUNTS_FIXTURE;
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    delete process.env.GOOGLE_ADS_CLIENT_ID;
    delete process.env.GOOGLE_ADS_CLIENT_SECRET;
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;
    delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    vi.useRealTimers();
  });

  it("returns discovered accounts, excluding manager/sub-manager rows", async () => {
    const result = await googleAdsConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(3);
    expect(result.accounts[0]).toEqual({ id: "1234567890", name: "Acme Roofing", extra: "USD · ENABLED" });
    expect(result.accounts.some((a) => a.name === "Agency MCC")).toBe(false);
  });

  it("returns error when the fixture file is missing", async () => {
    process.env.GOOGLE_ADS_ACCOUNTS_FIXTURE = "does-not-exist.json";

    const result = await googleAdsConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns a friendly access-denied message on 403, not a raw status code", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    process.env.GOOGLE_ADS_CLIENT_ID = "client-id";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_ADS_REFRESH_TOKEN = "refresh-token";
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "1112223333";
    queryMock.mockRejectedValue(httpError(403, "403 Forbidden"));

    vi.useFakeTimers();
    const resultPromise = googleAdsConnector.listAccounts!();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toMatch(/No access to Google Ads accounts/);
  });

  it("returns error when credentials aren't configured", async () => {
    delete process.env.CONNECTOR_MODE;

    const result = await googleAdsConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns error when GOOGLE_ADS_LOGIN_CUSTOMER_ID isn't configured", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    process.env.GOOGLE_ADS_CLIENT_ID = "client-id";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_ADS_REFRESH_TOKEN = "refresh-token";

    const result = await googleAdsConnector.listAccounts!();

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toMatch(/GOOGLE_ADS_LOGIN_CUSTOMER_ID/);
  });
});
