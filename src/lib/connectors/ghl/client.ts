import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveredAccount, DiscoveryResult } from "../types";
import { listStoredCredentials, storedIdFromLabel, storedSecretForLabel } from "../stored-credentials";

// Confirmed live: despite GHL's own docs framing this as an "agency-level"
// API, a Private Integration token is location-scoped, not agency-wide —
// even one created with every available scope checked gets 403 "The
// token does not have access to this location" for any location other
// than the one it was created inside, and cannot call /locations/search
// at all (403 or an empty result, depending on the token). So this
// connector needs one key per client location, same shape as OpenPhone's
// per-workspace keys. Keys are normally pasted in Settings → API keys
// (stored-credentials.ts, label "db:<id>"); GHL_AGENCY_API_KEY__<LABEL>
// env vars still work for keys configured before that existed.
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

async function apiKeyForLabel(label: string | null | undefined): Promise<string | undefined> {
  if (!label) return undefined;
  if (storedIdFromLabel(label)) return storedSecretForLabel("ghl", label);
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
  const apiKey = await apiKeyForLabel(account.credentialLabel);
  if (!baseUrl) throw new Error("GHL_API_BASE_URL not configured");
  if (!apiKey) {
    throw new Error(
      !account.credentialLabel
        ? "No GoHighLevel key chosen for this client — add one in Settings → API keys, then pick it here."
        : storedIdFromLabel(account.credentialLabel)
          ? "This client's GoHighLevel key was deleted — add it again in Settings → API keys."
          : `${WORKSPACE_KEY_PREFIX}${account.credentialLabel} not configured`,
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

  // Saved keys know their own location, so each one is a real, pickable
  // account — the name auto-match on the client form finds it like any
  // other platform's.
  const accounts: DiscoveredAccount[] = [];
  let storedError: string | null = null;
  try {
    for (const cred of await listStoredCredentials("ghl")) {
      if (!cred.externalId) continue;
      accounts.push({ id: cred.externalId, name: cred.name, credentialLabel: cred.label, credentialName: cred.name });
    }
  } catch (err) {
    storedError = err instanceof Error ? err.message : String(err);
  }

  // Env-var keys don't record their location, so they're still
  // placeholders: selecting one sets the credentialLabel, and the location
  // ID is typed via "Enter ID manually".
  for (const cred of getConfiguredCredentials()) {
    accounts.push({
      id: "",
      name: `Enter the ${humanizeLabel(cred.label)} location ID manually`,
      credentialLabel: cred.label,
      credentialName: humanizeLabel(cred.label),
    });
  }

  if (accounts.length === 0) {
    return { status: "error", error: storedError ?? "No GoHighLevel keys yet — add one in Settings → API keys." };
  }
  return { status: "ok", accounts };
}

// Used when a key is pasted in Settings: proves the key can read
// opportunities for that location before it's saved, so a wrong key or
// location ID fails there rather than at the next sync.
export async function testGhlKey(apiKey: string, locationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseUrl = process.env.GHL_API_BASE_URL;
  if (!baseUrl) return { ok: false, error: "GoHighLevel isn't fully set up in this app yet — ask your developer to finish connecting it." };

  await rateLimiter.wait();
  const url = new URL(`${baseUrl}/opportunities/search`);
  url.searchParams.set("location_id", locationId);
  url.searchParams.set("limit", "1");
  try {
    const response = await fetch(url, { headers: ghlHeaders(apiKey) });
    if (response.ok) return { ok: true };
    if (response.status === 401) return { ok: false, error: "GoHighLevel didn't accept this key. Check you copied the whole key." };
    if (response.status === 403) {
      return {
        ok: false,
        error:
          "This key can't see that sub-account. Check the sub-account ID, and that the key was made inside that same sub-account with “View Opportunities” ticked.",
      };
    }
    return { ok: false, error: "GoHighLevel had a problem checking this key. Please try again in a minute." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
