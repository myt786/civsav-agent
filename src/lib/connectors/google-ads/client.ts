import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleAdsApi } from "google-ads-api";
import { formatInTimeZone } from "date-fns-tz";
import { RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveredAccount, DiscoveryResult } from "../types";

// Explorer access tier caps at 2,880 operations/day — 1 op per 30s on
// average. Report queries are already batched per client (one call per
// sync), so this limiter just keeps consecutive client syncs spaced out.
const rateLimiter = new RateLimiter({ requestsPerSecond: 1 / 30 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "google-ads");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// google-ads-api throws on failure rather than returning a response we can
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

export async function fetchRawCampaignReport(
  account: PlatformAccount,
  range: DateRange,
): Promise<unknown> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.GOOGLE_ADS_FIXTURE ?? "success.json";
    const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
    return JSON.parse(raw);
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!developerToken || !clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN not configured",
    );
  }

  await rateLimiter.wait();

  const client = new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  });
  const customer = client.Customer({
    customer_id: account.externalId,
    refresh_token: refreshToken,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  });

  const date = formatInTimeZone(range.start, account.clientTimezone, "yyyy-MM-dd");

  return withRetry(() =>
    customer.report({
      entity: "campaign",
      metrics: [
        "metrics.impressions",
        "metrics.clicks",
        "metrics.cost_micros",
        "metrics.conversions",
      ],
      segments: ["segments.date"],
      from_date: date,
      to_date: date,
    }),
  );
}

interface CustomerClientRow {
  customer_client: {
    id?: string | number;
    descriptive_name?: string;
    status?: string;
    manager?: boolean;
    currency_code?: string;
  };
}

export async function listGoogleAdsAccounts(): Promise<DiscoveryResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.GOOGLE_ADS_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const rows = JSON.parse(raw) as CustomerClientRow[];
      return { status: "ok", accounts: rowsToAccounts(rows) };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (!developerToken || !clientId || !clientSecret || !refreshToken) {
    return {
      status: "error",
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN not configured.",
    };
  }
  if (!loginCustomerId) {
    return {
      status: "error",
      error: "GOOGLE_ADS_LOGIN_CUSTOMER_ID not configured — discovery needs the manager account ID to list child accounts.",
    };
  }

  await rateLimiter.wait();

  try {
    const client = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    });
    // Queried against the manager account itself (not a specific client's
    // externalId) — that's what surfaces every child account underneath it.
    const customer = client.Customer({
      customer_id: loginCustomerId,
      refresh_token: refreshToken,
      login_customer_id: loginCustomerId,
    });

    const rows = await withRetry(() =>
      customer.query<CustomerClientRow[]>(
        "SELECT customer_client.id, customer_client.descriptive_name, customer_client.status, customer_client.manager, customer_client.currency_code FROM customer_client WHERE customer_client.level <= 1",
      ),
    );

    return { status: "ok", accounts: rowsToAccounts(rows) };
  } catch (err) {
    const status = getStatusCode(err);
    if (status === 401 || status === 403) {
      return {
        status: "error",
        error:
          "No access to Google Ads accounts under the manager account. Check the refresh token has access and GOOGLE_ADS_LOGIN_CUSTOMER_ID is correct.",
      };
    }
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

// Manager/sub-manager nodes aren't billable ad accounts a client maps to —
// only leaf accounts are worth surfacing in the combobox.
function rowsToAccounts(rows: CustomerClientRow[]): DiscoveredAccount[] {
  return rows
    .filter((row) => !row.customer_client.manager)
    .filter((row) => row.customer_client.id !== undefined && row.customer_client.descriptive_name)
    .map((row) => ({
      id: String(row.customer_client.id),
      name: row.customer_client.descriptive_name!,
      extra: [row.customer_client.currency_code, row.customer_client.status]
        .filter(Boolean)
        .join(" · "),
    }));
}
