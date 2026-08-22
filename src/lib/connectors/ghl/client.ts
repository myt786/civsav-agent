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

  const url = new URL(`${baseUrl}/opportunities`);
  url.searchParams.set("locationId", account.externalId);
  url.searchParams.set("start", range.start.toISOString());
  url.searchParams.set("end", range.end.toISOString());

  const response = await fetchWithRetry(
    url,
    { headers: { Authorization: `Bearer ${apiKey}` } },
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

  await rateLimiter.wait();

  const url = new URL(`${baseUrl}/locations/search`);

  try {
    const response = await fetchWithRetry(
      url,
      { headers: { Authorization: `Bearer ${apiKey}` } },
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
    return {
      status: "ok",
      accounts: parsed.locations.map((location) => ({ id: location.id, name: location.name })),
    };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
