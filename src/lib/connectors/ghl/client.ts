import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange } from "../types";

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
