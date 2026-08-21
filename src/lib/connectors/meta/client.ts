import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange } from "../types";

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
