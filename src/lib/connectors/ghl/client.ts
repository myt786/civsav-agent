import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveryResult } from "../types";

// Confirmed live: despite GHL's own docs framing this as an "agency-level"
// API, a Private Integration token is location-scoped, not agency-wide —
// even one created with every available scope checked gets 403 "The
// token does not have access to this location" for any location other
// than the one it was created inside, and cannot call /locations/search
// at all (403 or an empty result, depending on the token). So this
// connector needs one key per client location, same shape as OpenPhone's
// per-workspace keys — GHL_AGENCY_API_KEY__<LABEL> per client.
const rateLimiter = new RateLimiter({ requestsPerSecond: 1 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "ghl");

// Confirmed live against the real API — every request, including
// discovery, 401s with "version header was not found" without this. GHL
// versions its v2 API by request date, not a semver-style number.
const GHL_API_VERSION = "2021-07-28";

const WORKSPACE_KEY_PREFIX = "GHL_AGENCY_API_KEY__";

function ghlHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}`, Version: GHL_API_VERSION };
}

interface GhlCredential {
  label: string;
  apiKey: string;
}

function getConfiguredCredentials(): GhlCredential[] {
  const credentials: GhlCredential[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(WORKSPACE_KEY_PREFIX) && value) {
      credentials.push({ label: key.slice(WORKSPACE_KEY_PREFIX.length), apiKey: value });
    }
  }
  return credentials;
}

function apiKeyForLabel(label: string | null | undefined): string | undefined {
  if (!label) return undefined;
  return process.env[`${WORKSPACE_KEY_PREFIX}${label}`];
}

function humanizeLabel(label: string): string {
  return label
    .toLowerCase()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
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
  const apiKey = apiKeyForLabel(account.credentialLabel);
  if (!baseUrl || !apiKey) {
    throw new Error(
      account.credentialLabel
        ? `GHL_API_BASE_URL / ${WORKSPACE_KEY_PREFIX}${account.credentialLabel} not configured`
        : "This mapping has no credentialLabel set — GHL keys are per-location, not shared.",
    );
  }

  // Real endpoint is /opportunities/search, not bare /opportunities (a
  // genuine 404) — its filter param is location_id (snake_case, not
  // locationId), and date/endDate are Unix milliseconds, not ISO
  // strings or date-only strings (both rejected as "invalid start
  // date"). All confirmed live. Cursor-paginated via startAfter/
  // startAfterId — a real client here had 350 opportunities, far past
  // one page.
  const opportunities: unknown[] = [];
  let startAfter: number | undefined;
  let startAfterId: string | undefined;
  const PAGE_SIZE = 100;

  for (;;) {
    await rateLimiter.wait();
    const url = new URL(`${baseUrl}/opportunities/search`);
    url.searchParams.set("location_id", account.externalId);
    url.searchParams.set("date", String(range.start.getTime()));
    url.searchParams.set("endDate", String(range.end.getTime()));
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (startAfter !== undefined) url.searchParams.set("startAfter", String(startAfter));
    if (startAfterId !== undefined) url.searchParams.set("startAfterId", startAfterId);

    const response = await fetchWithRetry(
      url,
      { headers: ghlHeaders(apiKey) },
      { maxRetries: 5, baseDelayMs: 1000 },
    );

    if (!response.ok) {
      throw new HttpError(response.status, `${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      opportunities?: unknown[];
      meta?: { startAfter?: number | null; startAfterId?: string | null };
    };
    const page = body.opportunities ?? [];
    opportunities.push(...page);

    if (page.length < PAGE_SIZE || !body.meta?.startAfterId) break;
    startAfter = body.meta.startAfter ?? undefined;
    startAfterId = body.meta.startAfterId;
  }

  return { opportunities };
}

export async function listGhlLocations(): Promise<DiscoveryResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.GHL_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as { locations: { id: string; name: string; credentialLabel?: string }[] };
      return {
        status: "ok",
        accounts: parsed.locations.map((location) => ({
          id: location.id,
          name: location.name,
          credentialLabel: location.credentialLabel,
        })),
      };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const credentials = getConfiguredCredentials();
  if (credentials.length === 0) {
    return { status: "error", error: `No ${WORKSPACE_KEY_PREFIX}<LABEL> configured.` };
  }

  // There is no real directory to browse — see the module comment. Each
  // configured credential already corresponds to exactly one known
  // location (the one it was created inside, which the admin who created
  // it already knows), so this surfaces one manual-entry placeholder per
  // credential rather than a real account list. Selecting one sets the
  // matching credentialLabel; the admin then types the real location ID
  // via "Enter ID manually".
  return {
    status: "ok",
    accounts: credentials.map((cred) => ({
      id: "",
      name: `Enter the ${humanizeLabel(cred.label)} location ID manually`,
      credentialLabel: cred.label,
    })),
  };
}
