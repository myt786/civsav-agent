import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const { queryMock, sitesListMock, googleAuthMock, searchconsoleMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  sitesListMock: vi.fn(),
  googleAuthMock: vi.fn(),
  searchconsoleMock: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: googleAuthMock },
    searchconsole: searchconsoleMock,
  },
}));

import { searchConsoleConnector } from "./index";
import type { PlatformAccount, DateRange } from "../types";

const account: PlatformAccount = {
  clientId: "client-1",
  clientTimezone: "America/New_York",
  platform: "search_console",
  externalId: "https://example.com/",
};

const range: DateRange = {
  start: new Date("2026-08-19T00:00:00Z"),
  end: new Date("2026-08-21T23:59:59Z"),
};

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

describe("searchConsoleConnector", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    queryMock.mockReset();
    sitesListMock.mockReset();
    searchconsoleMock.mockReset();
    searchconsoleMock.mockReturnValue({ searchanalytics: { query: queryMock }, sites: { list: sitesListMock } });
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.SEARCH_CONSOLE_FIXTURE;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    vi.useRealTimers();
  });

  it("returns ok with normalized data on a healthy response", async () => {
    process.env.SEARCH_CONSOLE_FIXTURE = "success.json";

    const result = await searchConsoleConnector.fetch(account, range);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.totalClicks).toBe(153);
    expect(result.data.totalImpressions).toBe(2633);
    expect(result.data.topQueries[0]).toEqual({
      query: "emergency plumber near me",
      clicks: 41,
      impressions: 612,
      position: 4.1,
    });
    expect(result.data.dataDate).toBe("2026-08-18");
    expect(result.raw).toBeDefined();
  });

  it("returns no_data (not a zero) when Search Console has no rows yet", async () => {
    process.env.SEARCH_CONSOLE_FIXTURE = "empty.json";

    const result = await searchConsoleConnector.fetch(account, range);

    expect(result.status).toBe("no_data");
    if (result.status !== "no_data") throw new Error("expected no_data");
    expect(result.raw).toBeDefined();
  });

  it("returns error (never a coerced value) on a malformed response", async () => {
    process.env.SEARCH_CONSOLE_FIXTURE = "malformed.json";

    const result = await searchConsoleConnector.fetch(account, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toBeTruthy();
  });

  it("returns error when the fixture file itself is missing", async () => {
    process.env.SEARCH_CONSOLE_FIXTURE = "does-not-exist.json";

    const result = await searchConsoleConnector.fetch(account, range);

    expect(result.status).toBe("error");
  });

  it("does not retry a 429 and returns error immediately", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "test@test.iam.gserviceaccount.com",
      private_key: "test",
    });
    queryMock.mockRejectedValue(httpError(429, "429 Too Many Requests"));

    const result = await searchConsoleConnector.fetch(account, range);

    expect(result.status).toBe("error");
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with backoff and eventually returns error", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "test@test.iam.gserviceaccount.com",
      private_key: "test",
    });
    queryMock.mockRejectedValue(httpError(500, "500 Internal Server Error"));

    vi.useFakeTimers();
    const resultPromise = searchConsoleConnector.fetch(account, range);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe("error");
    expect(queryMock).toHaveBeenCalledTimes(4); // initial attempt + 3 retries
  });
});

describe("searchConsoleConnector.listAccounts", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    sitesListMock.mockReset();
    searchconsoleMock.mockReset();
    searchconsoleMock.mockReturnValue({ searchanalytics: { query: queryMock }, sites: { list: sitesListMock } });
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.SEARCH_CONSOLE_ACCOUNTS_FIXTURE;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  });

  it("maps site entries to discovered accounts, using the URL/domain as both id and name", async () => {
    const result = await searchConsoleConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(3);
    expect(result.accounts[0]).toEqual({
      id: "https://acmeroofing.com/",
      name: "https://acmeroofing.com/",
      extra: "siteOwner",
    });
    expect(result.accounts[1].id).toBe("sc-domain:blueridgedental.com");
  });

  it("returns error when the fixture file is missing", async () => {
    process.env.SEARCH_CONSOLE_ACCOUNTS_FIXTURE = "does-not-exist.json";

    const result = await searchConsoleConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns a friendly access-denied message on 403, not a raw status code", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "test@test.iam.gserviceaccount.com",
      private_key: "test",
    });
    sitesListMock.mockRejectedValue(httpError(403, "403 Forbidden"));

    const result = await searchConsoleConnector.listAccounts!();

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toMatch(/No access to Search Console properties/);
  });

  it("returns error when credentials aren't configured", async () => {
    delete process.env.CONNECTOR_MODE;

    const result = await searchConsoleConnector.listAccounts!();

    expect(result.status).toBe("error");
  });
});
