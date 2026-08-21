import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const { runReportMock, betaAnalyticsDataClientMock } = vi.hoisted(() => {
  const runReportMock = vi.fn();
  // BetaAnalyticsDataClient is called with `new` in client.ts, so its mock
  // implementation must be a real function — an arrow function can't be
  // constructed.
  const betaAnalyticsDataClientMock = vi.fn(function BetaAnalyticsDataClientMock() {
    return { runReport: runReportMock };
  });
  return { runReportMock, betaAnalyticsDataClientMock };
});

vi.mock("@google-analytics/data", () => ({
  BetaAnalyticsDataClient: betaAnalyticsDataClientMock,
}));

import { ga4Connector } from "./index";
import type { PlatformAccount, DateRange } from "../types";

const account: PlatformAccount = {
  clientId: "client-1",
  clientTimezone: "America/New_York",
  platform: "ga4",
  externalId: "123456789",
};

const range: DateRange = {
  start: new Date("2026-08-19T00:00:00Z"),
  end: new Date("2026-08-21T23:59:59Z"),
};

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

describe("ga4Connector", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    runReportMock.mockReset();
    betaAnalyticsDataClientMock.mockReset();
    betaAnalyticsDataClientMock.mockImplementation(function BetaAnalyticsDataClientMock() {
      return { runReport: runReportMock };
    });
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.GA4_FIXTURE;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    vi.useRealTimers();
  });

  it("returns ok with normalized data on a healthy response", async () => {
    process.env.GA4_FIXTURE = "success.json";

    const result = await ga4Connector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.totalSessions).toBe(634);
    expect(result.data.totalConversions).toBe(31);
    expect(result.data.trafficSources).toContainEqual({
      source: "google",
      sessions: 412,
      conversions: 26,
    });
    // The phone-number-tap discrepancy must stay visible, not hidden in
    // the aggregate.
    expect(result.data.conversionEvents).toContainEqual({
      eventName: "phone_number_click",
      conversions: 23,
    });
    expect(result.data.conversionEvents).not.toContainEqual(
      expect.objectContaining({ eventName: "page_view" }),
    );
    expect(result.data.rangeStart).toBe("2026-08-18");
    expect(result.raw).toBeDefined();
  });

  it("returns no_data (not a zero) when GA4 has no traffic source rows", async () => {
    process.env.GA4_FIXTURE = "empty.json";

    const result = await ga4Connector.fetch(account, range);

    expect(result.status).toBe("no_data");
    if (result.status !== "no_data") throw new Error("expected no_data");
    expect(result.raw).toBeDefined();
  });

  it("returns error (never a coerced value) on a malformed response", async () => {
    process.env.GA4_FIXTURE = "malformed.json";

    const result = await ga4Connector.fetch(account, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toBeTruthy();
  });

  it("returns error when the fixture file itself is missing", async () => {
    process.env.GA4_FIXTURE = "does-not-exist.json";

    const result = await ga4Connector.fetch(account, range);

    expect(result.status).toBe("error");
  });

  it("does not retry a 429 and returns error immediately", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "test@test.iam.gserviceaccount.com",
      private_key: "test",
    });
    runReportMock.mockRejectedValue(httpError(429, "429 Too Many Requests"));

    const result = await ga4Connector.fetch(account, range);

    expect(result.status).toBe("error");
    expect(runReportMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with backoff and eventually returns error", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "test@test.iam.gserviceaccount.com",
      private_key: "test",
    });
    runReportMock.mockRejectedValue(httpError(500, "500 Internal Server Error"));

    vi.useFakeTimers();
    const resultPromise = ga4Connector.fetch(account, range);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("error");
    expect(runReportMock).toHaveBeenCalledTimes(4); // initial attempt + 3 retries
  });
});
