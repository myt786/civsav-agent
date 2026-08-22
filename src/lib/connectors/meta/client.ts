import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveryResult } from "../types";

// Configurable per connector, per the contract's rate-limit requirement.
const rateLimiter = new RateLimiter({ requestsPerSecond: 5 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "meta");

export async function fetchRawInsights(
  account: PlatformAccount,
  range: DateRange,
): Promise<unknown> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.META_FIXTURE ?? "success.json";
    const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
    return JSON.parse(raw);
  }

  const baseUrl = process.env.META_GRAPH_API_BASE_URL;
  // System user token — does not expire, unlike a user access token.
  const accessToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!baseUrl || !accessToken) {
    throw new Error("META_GRAPH_API_BASE_URL / META_SYSTEM_USER_ACCESS_TOKEN not configured");
  }

  await rateLimiter.wait();

  const url = new URL(`${baseUrl}/${account.externalId}/insights`);
  url.searchParams.set(
    "fields",
    "spend,impressions,clicks,actions,effective_status,attribution_setting",
  );
  url.searchParams.set("time_range", JSON.stringify({
    since: range.start.toISOString().slice(0, 10),
    until: range.end.toISOString().slice(0, 10),
  }));
  url.searchParams.set("access_token", accessToken);

  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new HttpError(response.status, `${response.status} ${response.statusText}`);
  }

  return response.json();
}

interface AdAccountsResponse {
  data: { id: string; name: string; currency?: string; account_status?: number }[];
}

// ACCOUNT_STATUS 1 is ACTIVE; anything else is disabled/pending/closed —
// listed here purely as a hint in the combobox, not enforced.
const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: "active",
  2: "disabled",
  3: "unsettled",
  7: "pending review",
  8: "pending closure",
  9: "in grace period",
  100: "pending settlement",
  101: "in migration",
};

export async function listAdAccounts(): Promise<DiscoveryResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.META_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as AdAccountsResponse;
      return {
        status: "ok",
        accounts: parsed.data.map((account) => ({
          id: account.id,
          name: account.name,
          extra: [account.currency, ACCOUNT_STATUS_LABELS[account.account_status ?? 1]]
            .filter(Boolean)
            .join(" · "),
        })),
      };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const baseUrl = process.env.META_GRAPH_API_BASE_URL;
  const accessToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!baseUrl || !accessToken) {
    return { status: "error", error: "META_GRAPH_API_BASE_URL / META_SYSTEM_USER_ACCESS_TOKEN not configured." };
  }

  await rateLimiter.wait();

  const url = new URL(`${baseUrl}/me/adaccounts`);
  url.searchParams.set("fields", "id,name,currency,account_status");
  url.searchParams.set("access_token", accessToken);

  try {
    const response = await fetchWithRetry(url);
    if (response.status === 401 || response.status === 403) {
      return {
        status: "error",
        error: "No access to Meta accounts. Check the system user token has this account assigned.",
      };
    }
    if (!response.ok) {
      return { status: "error", error: `${response.status} ${response.statusText}` };
    }
    const parsed = (await response.json()) as AdAccountsResponse;
    return {
      status: "ok",
      accounts: parsed.data.map((account) => ({
        id: account.id,
        name: account.name,
        extra: [account.currency, ACCOUNT_STATUS_LABELS[account.account_status ?? 1]]
          .filter(Boolean)
          .join(" · "),
      })),
    };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
