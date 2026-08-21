import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange } from "../types";

// Configurable per connector, per the contract's rate-limit requirement.
const rateLimiter = new RateLimiter({ requestsPerSecond: 5 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "ahrefs");

// Ahrefs is metered in API units and hard-stops the account when the
// budget is exhausted for the period — there is no "try again later",
// which is exactly why 4xx (a quota error included) must never be
// retried here. This is a static estimate for budgeting, not a value
// read from the response.
const UNIT_COST_ESTIMATE = 6;

// Small interface boundary so a different SEO data provider (SEMrush,
// Moz, ...) could be swapped in later without touching index.ts's
// aggregation or validation logic.
export interface SeoDataProvider {
  fetchSummary(account: PlatformAccount, range: DateRange): Promise<unknown>;
}

export const ahrefsProvider: SeoDataProvider = {
  async fetchSummary(account: PlatformAccount, range: DateRange): Promise<unknown> {
    if (process.env.CONNECTOR_MODE === "fixture") {
      const fixtureName = process.env.AHREFS_FIXTURE ?? "success.json";
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      return JSON.parse(raw);
    }

    const baseUrl = process.env.AHREFS_API_BASE_URL;
    const apiToken = process.env.AHREFS_API_TOKEN;
    if (!baseUrl || !apiToken) {
      throw new Error("AHREFS_API_BASE_URL / AHREFS_API_TOKEN not configured");
    }

    await rateLimiter.wait();

    const url = new URL(`${baseUrl}/site-explorer/metrics-summary`);
    url.searchParams.set("target", account.externalId);
    url.searchParams.set("date_from", range.start.toISOString());
    url.searchParams.set("date_to", range.end.toISOString());

    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (!response.ok) {
      throw new HttpError(response.status, `${response.status} ${response.statusText}`);
    }

    console.log(`[ahrefs] estimated ${UNIT_COST_ESTIMATE} units consumed this call`);

    return response.json();
  },
};
