import { readFile } from "node:fs/promises";
import path from "node:path";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { google } from "googleapis";
import { formatInTimeZone } from "date-fns-tz";
import { RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveredAccount, DiscoveryResult } from "../types";

// Configurable per connector, per the contract's rate-limit requirement.
const rateLimiter = new RateLimiter({ requestsPerSecond: 5 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "ga4");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// @google-analytics/data throws rather than returning a response we can
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

export async function fetchRawAnalyticsReport(
  account: PlatformAccount,
  range: DateRange,
): Promise<unknown> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.GA4_FIXTURE ?? "success.json";
    const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
    return JSON.parse(raw);
  }

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
  }

  await rateLimiter.wait();

  const client = new BetaAnalyticsDataClient({
    credentials: JSON.parse(serviceAccountJson),
  });
  const property = `properties/${account.externalId}`;
  const startDate = formatInTimeZone(range.start, account.clientTimezone, "yyyy-MM-dd");
  const endDate = formatInTimeZone(range.end, account.clientTimezone, "yyyy-MM-dd");
  const dateRanges = [{ startDate, endDate }];

  // Sessions/conversions by traffic source, and conversions by event name,
  // kept as two calls — see schema.ts for why they can't be combined.
  const [trafficSourceReport] = await withRetry(() =>
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
    }),
  );

  const [conversionEventReport] = await withRetry(() =>
    client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "conversions" }],
    }),
  );

  return { trafficSourceReport, conversionEventReport };
}

interface AccountSummary {
  displayName?: string | null;
  propertySummaries?: { property?: string | null; displayName?: string | null }[];
}

// The mapping's externalId is a numeric GA4 *property* ID, not an account
// — so discovery flattens every account's properties into one list rather
// than surfacing accounts, which nobody would actually pick.
function flattenPropertySummaries(summaries: AccountSummary[]): DiscoveredAccount[] {
  const accounts: DiscoveredAccount[] = [];
  for (const account of summaries) {
    for (const property of account.propertySummaries ?? []) {
      const propertyId = property.property?.split("/")[1];
      if (!propertyId || !property.displayName) continue;
      accounts.push({
        id: propertyId,
        name: property.displayName,
        extra: account.displayName ?? undefined,
      });
    }
  }
  return accounts;
}

export async function listGa4Properties(): Promise<DiscoveryResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.GA4_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as { accountSummaries?: AccountSummary[] };
      return { status: "ok", accounts: flattenPropertySummaries(parsed.accountSummaries ?? []) };
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
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });
    const analyticsadmin = google.analyticsadmin({ version: "v1beta", auth });

    const accounts: DiscoveredAccount[] = [];
    let pageToken: string | undefined;
    do {
      const response = await withRetry(() =>
        analyticsadmin.accountSummaries.list({ pageSize: 200, pageToken }),
      );
      accounts.push(...flattenPropertySummaries(response.data.accountSummaries ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return { status: "ok", accounts };
  } catch (err) {
    const status = getStatusCode(err);
    if (status === 401 || status === 403) {
      return {
        status: "error",
        error: "No access to GA4 properties. Check the service account has Viewer access on this property.",
      };
    }
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
