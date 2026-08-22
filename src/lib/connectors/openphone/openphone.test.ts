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

describe("openPhoneConnector.listAccounts", () => {
  beforeEach(() => {
    process.env.CONNECTOR_MODE = "fixture";
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.OPENPHONE_ACCOUNTS_FIXTURE;
    delete process.env.OPENPHONE_API_BASE_URL;
    delete process.env.OPENPHONE_API_KEY;
  });

  it("returns discovered numbers, using the E.164 number itself as id, tagged with the fixture's workspace", async () => {
    const result = await openPhoneConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(3);
    expect(result.accounts[0]).toEqual({
      id: "+14155551234",
      name: "Acme Roofing Main Line",
      extra: "Workspace: Main",
      credentialLabel: "MAIN",
    });
    expect(result.accounts[2].credentialLabel).toBe("NORTHEAST");
  });

  it("returns error when the fixture file is missing", async () => {
    process.env.OPENPHONE_ACCOUNTS_FIXTURE = "does-not-exist.json";

    const result = await openPhoneConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("returns a friendly access-denied message on 401/403, not a raw status code", async () => {
    delete process.env.CONNECTOR_MODE;
    process.env.OPENPHONE_API_BASE_URL = "https://api.openphone.com/v1";
    process.env.OPENPHONE_API_KEY = "test-key";
    fetchMock.mockResolvedValue(mockResponse(401));

    const result = await openPhoneConnector.listAccounts!();

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toMatch(/No access to OpenPhone numbers/);
  });

  it("returns error when credentials aren't configured", async () => {
    delete process.env.CONNECTOR_MODE;

    const result = await openPhoneConnector.listAccounts!();

    expect(result.status).toBe("error");
  });
});

describe("openPhoneConnector.listAccounts — multi-workspace", () => {
  beforeEach(() => {
    delete process.env.CONNECTOR_MODE;
    fetchMock.mockReset();
    process.env.OPENPHONE_API_BASE_URL = "https://api.openphone.com/v1";
  });

  afterEach(() => {
    delete process.env.CONNECTOR_MODE;
    delete process.env.OPENPHONE_API_BASE_URL;
    delete process.env.OPENPHONE_API_KEY;
    delete process.env.OPENPHONE_API_KEY__MAIN;
    delete process.env.OPENPHONE_API_KEY__NORTHEAST;
  });

  it("merges numbers across every configured OPENPHONE_API_KEY__<LABEL>, tagging each with its workspace", async () => {
    process.env.OPENPHONE_API_KEY__MAIN = "main-key";
    process.env.OPENPHONE_API_KEY__NORTHEAST = "northeast-key";
    fetchMock.mockImplementation((_url: URL, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      if (auth === "Bearer main-key") {
        return Promise.resolve(mockResponse(200, { data: [{ id: "pn_1", number: "+14155551234", name: "Main Line" }] }));
      }
      return Promise.resolve(mockResponse(200, { data: [{ id: "pn_2", number: "+17035559012", name: "NE Line" }] }));
    });

    const result = await openPhoneConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.find((a) => a.id === "+14155551234")?.credentialLabel).toBe("MAIN");
    expect(result.accounts.find((a) => a.id === "+17035559012")?.credentialLabel).toBe("NORTHEAST");
  });

  it("one workspace's key being rejected doesn't hide the other workspaces' numbers", async () => {
    process.env.OPENPHONE_API_KEY__MAIN = "main-key";
    process.env.OPENPHONE_API_KEY__NORTHEAST = "bad-key";
    fetchMock.mockImplementation((_url: URL, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      if (auth === "Bearer main-key") {
        return Promise.resolve(mockResponse(200, { data: [{ id: "pn_1", number: "+14155551234", name: "Main Line" }] }));
      }
      return Promise.resolve(mockResponse(401));
    });

    const result = await openPhoneConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toEqual([
      expect.objectContaining({ id: "+14155551234", credentialLabel: "MAIN" }),
    ]);
  });

  it("returns error when every configured workspace fails", async () => {
    process.env.OPENPHONE_API_KEY__MAIN = "bad-key";
    fetchMock.mockResolvedValue(mockResponse(401));

    const result = await openPhoneConnector.listAccounts!();

    expect(result.status).toBe("error");
  });

  it("keeps working with just the legacy single OPENPHONE_API_KEY (unlabeled workspace)", async () => {
    process.env.OPENPHONE_API_KEY = "legacy-key";
    fetchMock.mockResolvedValue(mockResponse(200, { data: [{ id: "pn_1", number: "+14155551234", name: "Main Line" }] }));

    const result = await openPhoneConnector.listAccounts!();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toEqual([{ id: "+14155551234", name: "Main Line", extra: undefined, credentialLabel: undefined }]);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer legacy-key");
  });

  it("goes live on a real workspace key even when CONNECTOR_MODE is still 'fixture'", async () => {
    // Listing numbers is cheap, unlike the rate-limited fetch path — a real
    // key takes discovery live on its own, same as Ahrefs, so someone who's
    // wired up a real workspace doesn't have to flip every other
    // connector's dev safety net off just to see it here.
    process.env.CONNECTOR_MODE = "fixture";
    process.env.OPENPHONE_API_KEY__MAIN = "main-key";
    fetchMock.mockResolvedValue(mockResponse(200, { data: [{ id: "pn_1", number: "+15125550100", name: "Real Line" }] }));

    const result = await openPhoneConnector.listAccounts!();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.accounts).toEqual([
      { id: "+15125550100", name: "Real Line", extra: "Workspace: Main", credentialLabel: "MAIN" },
    ]);
  });
});

describe("openPhoneConnector.fetch — picks the key matching the mapping's credentialLabel", () => {
  beforeEach(() => {
    delete process.env.CONNECTOR_MODE;
    fetchMock.mockReset();
    process.env.OPENPHONE_API_BASE_URL = "https://api.openphone.com/v1";
    fetchMock.mockResolvedValue(mockResponse(200, { data: [] }));
  });

  afterEach(() => {
    delete process.env.OPENPHONE_API_BASE_URL;
    delete process.env.OPENPHONE_API_KEY;
    delete process.env.OPENPHONE_API_KEY__NORTHEAST;
  });

  it("uses OPENPHONE_API_KEY__<LABEL> when the mapping has a credentialLabel", async () => {
    process.env.OPENPHONE_API_KEY__NORTHEAST = "northeast-key";

    await openPhoneConnector.fetch({ ...account, credentialLabel: "NORTHEAST" }, range);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer northeast-key");
  });

  it("falls back to the legacy OPENPHONE_API_KEY when the mapping has no credentialLabel", async () => {
    process.env.OPENPHONE_API_KEY = "legacy-key";

    await openPhoneConnector.fetch(account, range);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer legacy-key");
  });

  it("errors with the labeled env var name when that workspace's key isn't configured", async () => {
    const result = await openPhoneConnector.fetch({ ...account, credentialLabel: "NORTHEAST" }, range);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected error");
    expect(result.error).toContain("OPENPHONE_API_KEY__NORTHEAST");
  });
});
