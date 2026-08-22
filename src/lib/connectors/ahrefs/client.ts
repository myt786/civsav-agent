import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveredAccount, DiscoveryResult } from "../types";

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

// Shape of GET /v3/management/projects — confirmed against the live API.
// Note the field names: `project_name`/`url`, not `name`/`domain`.
interface AhrefsProject {
  project_id: string;
  project_name: string;
  // Bare host with a trailing slash, e.g. "www.example.com/" — no scheme.
  url: string;
  verified?: boolean;
  keyword_count?: number;
}

interface ProjectsResponse {
  projects: AhrefsProject[];
}

// The mapping's externalId is the bare domain (validated by
// ahrefsExternalId in settings/validation.ts), not Ahrefs' internal
// project_id — so `id` here must be the domain, derived from `url` by
// dropping its trailing slash.
function toDiscoveredAccounts(response: ProjectsResponse): DiscoveredAccount[] {
  return response.projects.map((project) => ({
    id: project.url.replace(/\/+$/, ""),
    name: project.project_name,
    extra: project.verified === false ? "not verified in Ahrefs" : undefined,
  }));
}

export async function listAhrefsProjects(): Promise<DiscoveryResult> {
  const baseUrl = process.env.AHREFS_API_BASE_URL;
  const apiToken = process.env.AHREFS_API_TOKEN;

  // Unlike fetchSummary (metered, hard-stops on quota exhaustion — stays
  // fixture-gated by CONNECTOR_MODE), listing projects is a single cheap
  // call. So real credentials take discovery live on their own, even in a
  // CONNECTOR_MODE=fixture dev environment: someone who's wired up a real
  // token wants to see their real projects when adding a client, without
  // flipping every other connector's dev safety net off to get it.
  if ((!baseUrl || !apiToken) && process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.AHREFS_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as ProjectsResponse;
      return { status: "ok", accounts: toDiscoveredAccounts(parsed) };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (!baseUrl || !apiToken) {
    return { status: "error", error: "AHREFS_API_BASE_URL / AHREFS_API_TOKEN not configured." };
  }

  await rateLimiter.wait();

  const url = new URL(`${baseUrl}/management/projects`);

  try {
    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (response.status === 401 || response.status === 403) {
      return {
        status: "error",
        error: "No access to Ahrefs projects. Check the API token is valid and has projects assigned to it.",
      };
    }
    if (!response.ok) {
      return { status: "error", error: `${response.status} ${response.statusText}` };
    }
    const parsed = (await response.json()) as ProjectsResponse;
    return { status: "ok", accounts: toDiscoveredAccounts(parsed) };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
