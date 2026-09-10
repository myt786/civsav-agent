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

// Developer tokens were sunset 2026-09-09 — the API now derives the access
// level from the Cloud project behind the OAuth client and ignores this
// header (it will be rejected outright in a future major version). But
// google-ads-api v24 still types `developer_token` as a required string, so
// pass a throwaway. GOOGLE_ADS_DEVELOPER_TOKEN can still override it for an
// older account that hasn't migrated, but nothing reads the value now.
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "sunset-ignored";

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

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN not configured",
    );
  }

  await rateLimiter.wait();

  const client = new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: DEVELOPER_TOKEN,
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

// customer_client rows come back from a `FROM customer_client` query run
// against a manager (MCC) account. customer rows come back from a
// `FROM customer` query run against a single account directly. Both carry
// the same fields under a different key — normalized to DiscoveredCustomer
// so one filter/map handles either source.
interface CustomerClientRow {
  customer_client: {
    id?: string | number;
    descriptive_name?: string;
    status?: string | number;
    manager?: boolean;
    currency_code?: string;
  };
}

interface CustomerRow {
  customer: {
    id?: string | number;
    descriptive_name?: string;
    status?: string | number;
    manager?: boolean;
    currency_code?: string;
  };
}

// A raw `FROM customer` query returns customer.status as the numeric enum
// (2) rather than the parsed label; `FROM customer_client` returns the
// label. Normalize both so the discovery combobox reads "ENABLED", not "2".
const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  "2": "ENABLED",
  "3": "CANCELED",
  "4": "SUSPENDED",
  "5": "CLOSED",
};

function normalizeStatus(status: string | number | undefined): string | undefined {
  if (status === undefined || status === null) return undefined;
  const s = String(status);
  return CUSTOMER_STATUS_LABELS[s] ?? s;
}

interface DiscoveredCustomer {
  id: string;
  name?: string;
  status?: string;
  currencyCode?: string;
  manager?: boolean;
}

export async function listGoogleAdsAccounts(): Promise<DiscoveryResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.GOOGLE_ADS_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const rows = JSON.parse(raw) as CustomerClientRow[];
      return { status: "ok", accounts: toDiscoveredAccounts(customerClientRowsToDiscovered(rows)) };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  // Optional. Set it and discovery walks the child accounts under that MCC.
  // Leave it blank (the current tayyab@civsav.com setup — a plain login, not
  // a manager) and discovery lists whatever accounts that OAuth user can see
  // directly. The MCC path stays wired up for when the manager account is
  // approved and we switch over.
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (!clientId || !clientSecret || !refreshToken) {
    return {
      status: "error",
      error:
        "GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN not configured.",
    };
  }

  await rateLimiter.wait();

  try {
    const client = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: DEVELOPER_TOKEN,
    });

    const customers = loginCustomerId
      ? await listAccountsViaManager(client, refreshToken, loginCustomerId)
      : await listAccountsViaDirectAccess(client, refreshToken);

    return { status: "ok", accounts: toDiscoveredAccounts(customers) };
  } catch (err) {
    const status = getStatusCode(err);
    if (status === 401 || status === 403) {
      return {
        status: "error",
        error: loginCustomerId
          ? "No access to Google Ads accounts under the manager account. Check the refresh token has access and GOOGLE_ADS_LOGIN_CUSTOMER_ID is correct."
          : "No access to any Google Ads accounts for this login. Check GOOGLE_ADS_REFRESH_TOKEN was issued for a user with Google Ads access.",
      };
    }
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

// Queried against the manager account itself (not a specific client's
// externalId) — that's what surfaces every child account underneath it.
async function listAccountsViaManager(
  client: GoogleAdsApi,
  refreshToken: string,
  loginCustomerId: string,
): Promise<DiscoveredCustomer[]> {
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

  return customerClientRowsToDiscovered(rows);
}

// No MCC: listAccessibleCustomers returns only the resource names of the
// accounts this OAuth user can reach directly, so each one needs a
// follow-up `FROM customer` query to fill in name / currency / status.
async function listAccountsViaDirectAccess(
  client: GoogleAdsApi,
  refreshToken: string,
): Promise<DiscoveredCustomer[]> {
  const { resource_names } = await withRetry(() => client.listAccessibleCustomers(refreshToken));
  const ids = (resource_names ?? [])
    .map((name) => name.split("/")[1])
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return [];

  const settled = await Promise.allSettled(
    ids.map((id) => {
      const customer = client.Customer({ customer_id: id, refresh_token: refreshToken });
      return withRetry(() =>
        customer.query<CustomerRow[]>(
          "SELECT customer.id, customer.descriptive_name, customer.status, customer.manager, customer.currency_code FROM customer",
        ),
      );
    }),
  );

  const rejected = settled.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  // Some lookups failing is tolerable (a cancelled account, a transient
  // error) — skip those. Every lookup failing means the credentials can't
  // actually see anything: surface that instead of an empty list.
  if (rejected.length === ids.length) throw rejected[0].reason;

  return settled
    .filter((r): r is PromiseFulfilledResult<CustomerRow[]> => r.status === "fulfilled")
    .flatMap((r) => customerRowsToDiscovered(r.value));
}

function customerClientRowsToDiscovered(rows: CustomerClientRow[]): DiscoveredCustomer[] {
  return rows.map((row) => ({
    id: row.customer_client.id !== undefined ? String(row.customer_client.id) : "",
    name: row.customer_client.descriptive_name,
    status: normalizeStatus(row.customer_client.status),
    currencyCode: row.customer_client.currency_code,
    manager: row.customer_client.manager,
  }));
}

function customerRowsToDiscovered(rows: CustomerRow[]): DiscoveredCustomer[] {
  return rows.map((row) => ({
    id: row.customer.id !== undefined ? String(row.customer.id) : "",
    name: row.customer.descriptive_name,
    status: normalizeStatus(row.customer.status),
    currencyCode: row.customer.currency_code,
    manager: row.customer.manager,
  }));
}

// Manager/sub-manager nodes aren't billable ad accounts a client maps to —
// only leaf accounts are worth surfacing in the combobox.
function toDiscoveredAccounts(customers: DiscoveredCustomer[]): DiscoveredAccount[] {
  return customers
    .filter((c) => !c.manager)
    .filter((c) => c.id !== "" && c.name)
    .map((c) => ({
      id: c.id,
      name: c.name!,
      extra: [c.currencyCode, c.status].filter(Boolean).join(" · "),
    }));
}
