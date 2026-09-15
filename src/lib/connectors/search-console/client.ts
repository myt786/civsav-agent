import { readFile } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { formatInTimeZone } from "date-fns-tz";
import { RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveredAccount, DiscoveryResult } from "../types";

// Configurable per connector, per the contract's rate-limit requirement.
const rateLimiter = new RateLimiter({ requestsPerSecond: 5 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "search-console");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// googleapis throws on non-2xx rather than returning a response we can
// inspect .ok on, so the shared fetchWithRetry (which wraps fetch directly)
// doesn't apply here. This mirrors its exact policy — retry 5xx/network,
// never retry 4xx — against the SDK's thrown errors instead.
function getStatusCode(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  if (typeof e.status === "number") return e.status;
  if (typeof e.response?.status === "number") return e.response.status;
  if (typeof e.code === "number") return e.code;
  return undefined;
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxRetries = 3;
  const baseDelayMs = 500;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      const status = getStatusCode(err);
      if (status !== undefined && status < 500) {
        throw err; // 4xx will not fix itself by being repeated
      }
      lastError = err;
      if (attempt === maxRetries) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function fetchRawSearchAnalytics(
  account: PlatformAccount,
  range: DateRange,
): Promise<unknown> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.SEARCH_CONSOLE_FIXTURE ?? "success.json";
    const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
    return JSON.parse(raw);
  }

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
  }

  await rateLimiter.wait();

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(serviceAccountJson),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  const searchconsole = google.searchconsole({ version: "v1", auth });

  // Search Console reports lag 2-3 days behind real time, so "yesterday" in
  // the client's timezone may not be ready yet — an empty result here is a
  // legitimate no_data, not a bug.
  const date = formatInTimeZone(range.start, account.clientTimezone, "yyyy-MM-dd");

  const response = await withRetry(() =>
    searchconsole.searchanalytics.query({
      siteUrl: account.externalId,
      requestBody: {
        startDate: date,
        endDate: date,
        dimensions: ["query"],
        rowLimit: 25,
      },
    }),
  );

  return response.data;
}

export interface GscBreakdownRow {
  key: string; // the query string, or the page URL
  clicks: number;
  impressions: number;
  position: number;
}

export type GscBreakdownResult =
  | { status: "ok"; topQueries: GscBreakdownRow[]; topPages: GscBreakdownRow[] }
  | { status: "no_data" }
  | { status: "error"; error: string };

interface SearchAnalyticsRow {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  position?: number | null;
}

function toBreakdownRows(rows: SearchAnalyticsRow[] | undefined | null): GscBreakdownRow[] {
  return (rows ?? [])
    .filter((r): r is SearchAnalyticsRow & { keys: string[] } => Boolean(r.keys?.[0]))
    .map((r) => ({
      key: r.keys[0],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? 0,
    }));
}

// A deeper, on-demand pull for the SEO recommendations feature — top
// queries AND top pages over a longer trailing window, not the single
// day + query-only dimension the daily sync connector fetches. Called
// only at recommendation-generation time, never wired into the daily
// sync or metric_snapshots.
export async function fetchGscBreakdown(siteUrl: string, days = 28): Promise<GscBreakdownResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.SEARCH_CONSOLE_BREAKDOWN_FIXTURE ?? "breakdown.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as { queryRows?: SearchAnalyticsRow[]; pageRows?: SearchAnalyticsRow[] };
      const topQueries = toBreakdownRows(parsed.queryRows);
      const topPages = toBreakdownRows(parsed.pageRows);
      if (topQueries.length === 0 && topPages.length === 0) return { status: "no_data" };
      return { status: "ok", topQueries, topPages };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return { status: "error", error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured" };
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(serviceAccountJson),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  const searchconsole = google.searchconsole({ version: "v1", auth });

  // Search Console lags 2-3 days — end the window there rather than at
  // "today", or the trailing days would mostly be not-ready-yet.
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  try {
    await rateLimiter.wait();
    const queryResponse = await withRetry(() =>
      searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: { startDate, endDate, dimensions: ["query"], rowLimit: 50 },
      }),
    );

    await rateLimiter.wait();
    const pageResponse = await withRetry(() =>
      searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: { startDate, endDate, dimensions: ["page"], rowLimit: 50 },
      }),
    );

    const topQueries = toBreakdownRows(queryResponse.data.rows as SearchAnalyticsRow[] | undefined);
    const topPages = toBreakdownRows(pageResponse.data.rows as SearchAnalyticsRow[] | undefined);
    if (topQueries.length === 0 && topPages.length === 0) return { status: "no_data" };
    return { status: "ok", topQueries, topPages };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

interface SiteEntry {
  siteUrl?: string | null;
  permissionLevel?: string | null;
}

function toDiscoveredAccounts(siteEntry: SiteEntry[]): DiscoveredAccount[] {
  return siteEntry
    .filter((site): site is SiteEntry & { siteUrl: string } => Boolean(site.siteUrl))
    // Search Console exposes no separate display name — the site URL /
    // domain property string is genuinely the only identifying info, so
    // it's used as both id and name.
    .map((site) => ({ id: site.siteUrl, name: site.siteUrl, extra: site.permissionLevel ?? undefined }));
}

export async function listSearchConsoleSites(): Promise<DiscoveryResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.SEARCH_CONSOLE_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as { siteEntry?: SiteEntry[] };
      return { status: "ok", accounts: toDiscoveredAccounts(parsed.siteEntry ?? []) };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return { status: "error", error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured." };
  }

  await rateLimiter.wait();

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceAccountJson),
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });
    const searchconsole = google.searchconsole({ version: "v1", auth });

    const response = await withRetry(() => searchconsole.sites.list());
    return { status: "ok", accounts: toDiscoveredAccounts(response.data.siteEntry ?? []) };
  } catch (err) {
    const status = getStatusCode(err);
    if (status === 401 || status === 403) {
      return {
        status: "error",
        error: "No access to Search Console properties. Check the service account has been added as a user on the property in Search Console.",
      };
    }
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
