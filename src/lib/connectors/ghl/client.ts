import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveryResult } from "../types";

// GHL is an agency-level API — one agency token authenticates requests for
// every client location, rather than each client storing its own key.
// account.externalId is the GHL locationId (enumerated once, at onboarding,
// into client_platform_accounts), not a per-client credential.
// Rate limits are tight, so this connector is deliberately more
// conservative than the shared defaults: fewer requests per second, and a
// longer backoff before retrying.
const rateLimiter = new RateLimiter({ requestsPerSecond: 1 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "ghl");

// Confirmed live against the real API — every request, including
// discovery, 401s with "version header was not found" without this. GHL
// versions its v2 API by request date, not a semver-style number.
const GHL_API_VERSION = "2021-07-28";

function ghlHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}`, Version: GHL_API_VERSION };
}

export async function fetchRawOpportunities(
  account: PlatformAccount,
  range: DateRange,
): Promise<unknown> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.GHL_FIXTURE ?? "success.json";
    const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
    return JSON.parse(raw);
  }

  const baseUrl = process.env.GHL_API_BASE_URL;
  const apiKey = process.env.GHL_AGENCY_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("GHL_API_BASE_URL / GHL_AGENCY_API_KEY not configured");
  }

  await rateLimiter.wait();

  // Real endpoint is /opportunities/search, not bare /opportunities (a
  // genuine 404) — and its date filters are `date`/`endDate`, not
  // `start`/`end`. Confirmed live.
  const url = new URL(`${baseUrl}/opportunities/search`);
  url.searchParams.set("locationId", account.externalId);
  url.searchParams.set("date", range.start.toISOString());
  url.searchParams.set("endDate", range.end.toISOString());

  const response = await fetchWithRetry(
    url,
    { headers: ghlHeaders(apiKey) },
    { maxRetries: 5, baseDelayMs: 1000 },
  );

  if (!response.ok) {
    throw new HttpError(response.status, `${response.status} ${response.statusText}`);
  }

  return response.json();
}

interface LocationsSearchResponse {
  locations: { id: string; name: string }[];
}

export async function listGhlLocations(): Promise<DiscoveryResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.GHL_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as LocationsSearchResponse;
      return {
        status: "ok",
        accounts: parsed.locations.map((location) => ({ id: location.id, name: location.name })),
      };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const baseUrl = process.env.GHL_API_BASE_URL;
  const apiKey = process.env.GHL_AGENCY_API_KEY;
  if (!baseUrl || !apiKey) {
    return { status: "error", error: "GHL_API_BASE_URL / GHL_AGENCY_API_KEY not configured." };
  }

  // /locations/search defaults to 10 results with no total-count field in
  // the envelope — confirmed live: this agency has 211 locations, so an
  // unpaginated call was silently hiding 95% of them from discovery.
  // `skip`/`limit` paging, stopping once a page comes back short of the
  // page size requested.
  const PAGE_SIZE = 100;
  const locations: { id: string; name: string }[] = [];
  let skip = 0;

  try {
    for (;;) {
      await rateLimiter.wait();
      const url = new URL(`${baseUrl}/locations/search`);
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("skip", String(skip));

      const response = await fetchWithRetry(
        url,
        { headers: ghlHeaders(apiKey) },
        { maxRetries: 5, baseDelayMs: 1000 },
      );
      if (response.status === 401 || response.status === 403) {
        return {
          status: "error",
          error: "No access to GoHighLevel locations. Check the agency API key is valid and has agency-level access.",
        };
      }
      if (!response.ok) {
        return { status: "error", error: `${response.status} ${response.statusText}` };
      }
      const parsed = (await response.json()) as LocationsSearchResponse;
      const page = parsed.locations ?? [];
      locations.push(...page.map((location) => ({ id: location.id, name: location.name })));

      if (page.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }
    return { status: "ok", accounts: locations };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
