import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildDigestSummary, buildDigestText, postSeoDigestToSlack } from "./digest";
import type { SeoDashboardData } from "./types";

function row(overrides: Partial<SeoDashboardData["rows"][number]>): SeoDashboardData["rows"][number] {
  return {
    clientId: "c1",
    clientName: "Acme",
    months: [],
    tier: "no_data",
    trend: "unknown",
    momPct: null,
    avg3: null,
    organicKeywords: { kind: "no_data" },
    organicKeywordsTop3: { kind: "no_data" },
    keywordsGained: { kind: "no_data" },
    keywordsLost: { kind: "no_data" },
    referringDomains: { kind: "no_data" },
    newReferringDomains: null,
    seoOwner: null,
    status: null,
    notes: null,
    prevMonthSummary: null,
    ...overrides,
  };
}

const baseData: SeoDashboardData = {
  generatedAt: new Date("2026-09-14"),
  months: ["2026-06", "2026-07", "2026-08"],
  rows: [
    row({ clientId: "c1", clientName: "Falling Co", trend: "falling_fast", keywordsGained: { kind: "ok", value: 2 }, keywordsLost: { kind: "ok", value: 10 } }),
    row({ clientId: "c2", clientName: "Growing Co", trend: "growing_fast", keywordsGained: { kind: "ok", value: 15 } }),
    row({ clientId: "c3", clientName: "Quiet Co", trend: "low_vol" }),
  ],
  aggregates: {
    tierCounts: { strong: 1, moderate: 1, small: 0, minimal: 1, no_data: 0 },
    portfolioMomPct: 0.15,
    portfolio3moPct: 0.3,
    newReferringDomainsSum: 7,
  },
};

describe("buildDigestSummary / buildDigestText", () => {
  it("summarizes falling/growing/low-vol clients and keyword/refdomain totals", () => {
    const summary = buildDigestSummary(baseData, new Date("2026-09-14"));
    expect(summary.fallingFast).toEqual(["Falling Co"]);
    expect(summary.growingFast).toEqual(["Growing Co"]);
    expect(summary.lowVolCount).toBe(1);
    expect(summary.keywordsGained).toBe(17);
    expect(summary.keywordsLost).toBe(10);
    expect(summary.newReferringDomainsSum).toBe(7);

    const text = buildDigestText(summary);
    expect(text).toContain("Falling fast (1)");
    expect(text).toContain("Falling Co");
    expect(text).toContain("Growing fast (1)");
    expect(text).toContain("Growing Co");
    expect(text).toContain("+17 gained / -10 lost");
    expect(text).toContain("+15.0% MoM");
  });
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("postSeoDigestToSlack", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });
  afterEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL_ID;
  });

  it("skips posting (not an error) when Slack isn't configured", async () => {
    const result = await postSeoDigestToSlack(buildDigestSummary(baseData));
    expect(result.posted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to chat.postMessage with both text and blocks when configured", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_CHANNEL_ID = "C123";
    fetchMock.mockResolvedValue({ ok: true, statusText: "OK", json: async () => ({ ok: true }) });

    const result = await postSeoDigestToSlack(buildDigestSummary(baseData));

    expect(result.posted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("C123");
    expect(body.text).toContain("SEO Portfolio Dashboard");
    expect(Array.isArray(body.blocks)).toBe(true);
  });

  it("throws when Slack responds with ok: false", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_CHANNEL_ID = "C123";
    fetchMock.mockResolvedValue({ ok: true, statusText: "OK", json: async () => ({ ok: false, error: "channel_not_found" }) });

    await expect(postSeoDigestToSlack(buildDigestSummary(baseData))).rejects.toThrow(/channel_not_found/);
  });
});
