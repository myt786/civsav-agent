import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleAdsApi } from "google-ads-api";
import { formatInTimeZone } from "date-fns-tz";
import { RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveredAccount, DiscoveryResult } from "../types";
import { listStoredCredentials, storedCredentialForLabel, storedIdFromLabel } from "../stored-credentials";

// Explorer access tier caps at 2,880 operations per DAY, not per second.
// Report queries are batched per client (one call per sync), so a daily run
// uses a handful of operations. This used to space calls 30s apart, which
// spent 2-3 minutes of the sync's 5-minute budget doing nothing; 1/s keeps
// a polite gap without that cost.
const rateLimiter = new RateLimiter({ requestsPerSecond: 1 });

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

// A Google user Google Ads is read as. The main one is set up in Vercel
// (GOOGLE_ADS_REFRESH_TOKEN, optionally reading through the manager account
// in GOOGLE_ADS_LOGIN_CUSTOMER_ID). Team members whose ad accounts sit
// under a different manager connect their own in Settings → API keys
// (oauth.ts): saved in platform_credentials with the refresh token as the
// secret and their manager ID as externalId, and a client's mapping points
// at it through credentialLabel ("db:<id>"). Every login shares the one
// OAuth client in GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET.
export interface GoogleAdsLogin {
  // null for the main login, "db:<id>" for a saved one.
  label: string | null;
  name: string;
  refreshToken: string;
  loginCustomerId?: string;
}

export const MAIN_LOGIN_NAME = "Main login";

function mainLogin(): GoogleAdsLogin | null {
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) return null;
  return {
    label: null,
    name: MAIN_LOGIN_NAME,
    refreshToken,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
  };
}

export function oauthClient(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function loginForLabel(label: string | null | undefined): Promise<GoogleAdsLogin | null> {
  if (!label) return mainLogin();
  if (!storedIdFromLabel(label)) return null;
  const stored = await storedCredentialForLabel("google_ads", label);
  if (!stored) return null;
  return { label, name: stored.name, refreshToken: stored.secret, loginCustomerId: stored.externalId ?? undefined };
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

  const oauth = oauthClient();
  const login = await loginForLabel(account.credentialLabel);
  if (!oauth || (!login && !account.credentialLabel)) {
    throw new Error(
      "GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN not configured",
    );
  }
  if (!login) {
    throw new Error(
      "The Google Ads login this client used was removed. Pick the account again on the client's page.",
    );
  }

  await rateLimiter.wait();

  const client = new GoogleAdsApi({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    developer_token: DEVELOPER_TOKEN,
  });
  const customer = client.Customer({
    customer_id: account.externalId,
    refresh_token: login.refreshToken,
    login_customer_id: login.loginCustomerId,
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

  const notConfigured: DiscoveryResult = {
    status: "error",
    error: "GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN not configured.",
  };
  const oauth = oauthClient();
  if (!oauth) return notConfigured;

  const logins: GoogleAdsLogin[] = [];
  const main = mainLogin();
  if (main) logins.push(main);
  try {
    for (const cred of await listStoredCredentials("google_ads")) {
      logins.push({ label: cred.label, name: cred.name, refreshToken: cred.secret, loginCustomerId: cred.externalId ?? undefined });
    }
  } catch {
    // Saved logins unreadable (e.g. the encryption secret changed) — the
    // main login still lists its accounts.
  }
  if (logins.length === 0) return notConfigured;

  const accounts: DiscoveredAccount[] = [];
  const errors: string[] = [];
  for (const login of logins) {
    const result = await listAccountsForLogin(oauth, login);
    if (result.status === "error") {
      errors.push(logins.length > 1 ? `${login.name}: ${result.error}` : result.error);
      continue;
    }
    for (const account of result.accounts) {
      // Saved logins' accounts are tagged so the mapping remembers which
      // login to use; with several logins, each says which it comes through.
      accounts.push({
        ...account,
        ...(logins.length > 1 ? { extra: [account.extra, `via ${login.name}`].filter(Boolean).join(" · ") } : {}),
        ...(login.label ? { credentialLabel: login.label, credentialName: login.name } : {}),
      });
    }
  }

  if (errors.length === logins.length) return { status: "error", error: errors.join(" ") };
  return { status: "ok", accounts };
}

// The accounts one login can read: every child of its manager account when
// it has one, otherwise whatever the Google user can open directly.
export async function listAccountsForLogin(
  oauth: { clientId: string; clientSecret: string },
  login: Pick<GoogleAdsLogin, "refreshToken" | "loginCustomerId">,
): Promise<DiscoveryResult> {
  await rateLimiter.wait();

  try {
    const client = new GoogleAdsApi({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      developer_token: DEVELOPER_TOKEN,
    });

    const customers = login.loginCustomerId
      ? await listAccountsViaManager(client, login.refreshToken, login.loginCustomerId)
      : await listAccountsViaDirectAccess(client, login.refreshToken);

    return { status: "ok", accounts: toDiscoveredAccounts(customers) };
  } catch (err) {
    const status = getStatusCode(err);
    if (status === 401 || status === 403) {
      return {
        status: "error",
        error: login.loginCustomerId
          ? "No access to Google Ads accounts under the manager account. Check the login still has access to that manager account and its ID is correct."
          : "No access to any Google Ads accounts for this login. Check the Google user it was connected with has Google Ads access.",
      };
    }
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

// The manager accounts a Google user can open directly — used when someone
// connects a login without typing their manager ID, so it can be filled in
// for them when there's exactly one.
export async function listManagerAccounts(
  oauth: { clientId: string; clientSecret: string },
  refreshToken: string,
): Promise<{ id: string; name: string }[]> {
  const client = new GoogleAdsApi({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    developer_token: DEVELOPER_TOKEN,
  });
  const { resource_names } = await withRetry(() => client.listAccessibleCustomers(refreshToken));
  const ids = (resource_names ?? []).map((name) => name.split("/")[1]).filter((id): id is string => Boolean(id));
  const settled = await Promise.allSettled(
    ids.map((id) =>
      withRetry(() =>
        client
          .Customer({ customer_id: id, refresh_token: refreshToken })
          .query<CustomerRow[]>("SELECT customer.id, customer.descriptive_name, customer.manager FROM customer"),
      ),
    ),
  );
  return settled
    .filter((r): r is PromiseFulfilledResult<CustomerRow[]> => r.status === "fulfilled")
    .flatMap((r) => customerRowsToDiscovered(r.value))
    .filter((c) => c.manager && c.id !== "")
    .map((c) => ({ id: c.id, name: c.name ?? c.id }));
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
