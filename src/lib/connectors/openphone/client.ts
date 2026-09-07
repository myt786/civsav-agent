import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { Telephony } from "../telephony/types";
import type { PlatformAccount, DateRange, DiscoveredAccount, DiscoveryResult } from "../types";

// Configurable per connector, per the contract's rate-limit requirement.
const rateLimiter = new RateLimiter({ requestsPerSecond: 5 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "openphone");

// OpenPhone has no agency/reseller API — a key is scoped to exactly one
// workspace, full access, nothing else. So unlike Meta/GHL/Google Ads
// (one shared credential works for every client), an agency whose
// clients live in separate OpenPhone workspaces needs one key per
// workspace. OPENPHONE_API_KEY__<LABEL> declares one; the bare
// OPENPHONE_API_KEY keeps working untouched as an unlabeled workspace,
// so a single-workspace setup needs zero config changes to keep working.
const WORKSPACE_KEY_PREFIX = "OPENPHONE_API_KEY__";

interface Workspace {
  label: string | null;
  apiKey: string;
}

function getConfiguredWorkspaces(): Workspace[] {
  const workspaces: Workspace[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(WORKSPACE_KEY_PREFIX) && value) {
      workspaces.push({ label: key.slice(WORKSPACE_KEY_PREFIX.length), apiKey: value });
    }
  }
  if (workspaces.length === 0 && process.env.OPENPHONE_API_KEY) {
    workspaces.push({ label: null, apiKey: process.env.OPENPHONE_API_KEY });
  }
  return workspaces;
}

function apiKeyForLabel(label: string | null | undefined): string | undefined {
  if (!label) return process.env.OPENPHONE_API_KEY;
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

// Real API paging envelope, shared by /phone-numbers, /conversations, and
// /calls: { data: [...], totalItems, nextPageToken }.
interface QuoPage<T> {
  data?: T[];
  nextPageToken?: string | null;
}

async function paginate<T>(
  buildUrl: (pageToken: string | null) => URL,
  apiKey: string,
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | null = null;
  for (;;) {
    await rateLimiter.wait();
    const response = await fetchWithRetry(buildUrl(pageToken), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new HttpError(response.status, `${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as QuoPage<T>;
    items.push(...(body.data ?? []));
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return items;
}

// account.externalId is the E.164 number (see the comment on
// toDiscoveredAccounts below for why), but /v1/calls and /v1/conversations
// both require the internal PN... id — so every real fetch resolves the
// number against /phone-numbers first.
async function resolvePhoneNumberId(baseUrl: string, apiKey: string, number: string): Promise<string> {
  await rateLimiter.wait();
  const response = await fetchWithRetry(new URL(`${baseUrl}/phone-numbers`), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new HttpError(response.status, `${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { data?: { id: string; number: string }[] };
  const match = (body.data ?? []).find((entry) => entry.number === number);
  if (!match) {
    throw new Error(`No OpenPhone number found matching ${number}`);
  }
  return match.id;
}

interface ConversationEntry {
  participants: string[];
}

export const openPhoneProvider: Telephony = {
  async fetchCallSummary(account: PlatformAccount, range: DateRange): Promise<unknown> {
    if (process.env.CONNECTOR_MODE === "fixture") {
      const fixtureName = process.env.OPENPHONE_FIXTURE ?? "success.json";
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      return JSON.parse(raw);
    }

    const baseUrl = process.env.OPENPHONE_API_BASE_URL;
    const apiKey = apiKeyForLabel(account.credentialLabel);
    if (!baseUrl || !apiKey) {
      throw new Error(
        account.credentialLabel
          ? `OPENPHONE_API_BASE_URL / ${WORKSPACE_KEY_PREFIX}${account.credentialLabel} not configured`
          : "OPENPHONE_API_BASE_URL / OPENPHONE_API_KEY not configured",
      );
    }

    const phoneNumberId = await resolvePhoneNumberId(baseUrl, apiKey, account.externalId);
    const rangeStart = range.start.toISOString();
    const rangeEnd = range.end.toISOString();

    // /v1/calls has no bulk mode — it's hard-scoped to one participant's
    // 1:1 conversation per query (confirmed against the real API and
    // docs). So this first enumerates every conversation active in the
    // window to discover participants, then fetches calls per participant
    // and combines them.
    const conversations = await paginate<ConversationEntry>((pageToken) => {
      const url = new URL(`${baseUrl}/conversations`);
      url.searchParams.set("phoneNumbers", phoneNumberId);
      url.searchParams.set("maxResults", "100");
      url.searchParams.set("updatedAfter", rangeStart);
      url.searchParams.set("updatedBefore", rangeEnd);
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      return url;
    }, apiKey);

    const participants = new Set<string>();
    for (const conversation of conversations) {
      for (const participant of conversation.participants) participants.add(participant);
    }

    const calls: unknown[] = [];
    for (const participant of participants) {
      const participantCalls = await paginate<unknown>((pageToken) => {
        const url = new URL(`${baseUrl}/calls`);
        url.searchParams.set("phoneNumberId", phoneNumberId);
        url.searchParams.set("participants", participant);
        url.searchParams.set("maxResults", "100");
        url.searchParams.set("createdAfter", rangeStart);
        url.searchParams.set("createdBefore", rangeEnd);
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        return url;
      }, apiKey);
      calls.push(...participantCalls);
    }

    return { calls };
  },
};

interface PhoneNumbersResponse {
  data: { id: string; number: string; name?: string }[];
}

// Fixture entries may carry a `workspace` label so multi-workspace
// discovery is exercisable in dev without configuring real extra keys.
interface FixturePhoneNumber {
  id: string;
  number: string;
  name?: string;
  workspace?: string;
}

function toDiscoveredAccounts(entries: FixturePhoneNumber[], label: string | null): DiscoveredAccount[] {
  return entries.map((entry) => {
    const effectiveLabel = entry.workspace ?? label ?? undefined;
    return {
      // The mapping's externalId is the E.164 phone number itself (see
      // openphoneExternalId in src/lib/settings/validation.ts), not
      // OpenPhone's internal id — so `id` here MUST be the number.
      id: entry.number,
      name: entry.name ?? entry.number,
      extra: effectiveLabel ? `Workspace: ${humanizeLabel(effectiveLabel)}` : undefined,
      credentialLabel: effectiveLabel,
    };
  });
}

export async function listOpenPhoneNumbers(): Promise<DiscoveryResult> {
  const baseUrl = process.env.OPENPHONE_API_BASE_URL;
  const workspaces = getConfiguredWorkspaces();

  // Listing numbers is a single cheap call, not the rate-limited/metered
  // fetch path — so real credentials take discovery live on their own,
  // same as Ahrefs, even while CONNECTOR_MODE=fixture is still set for
  // every other connector's dev safety net.
  if (workspaces.length === 0 && process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.OPENPHONE_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as { data: FixturePhoneNumber[] };
      return { status: "ok", accounts: toDiscoveredAccounts(parsed.data, null) };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (!baseUrl || workspaces.length === 0) {
    return { status: "error", error: "OPENPHONE_API_BASE_URL / OPENPHONE_API_KEY not configured." };
  }

  // One bad or unauthorized workspace must never hide every other
  // workspace's numbers — same isolation principle as discovery-cache.ts
  // batching all 8 platforms.
  const perWorkspaceResults = await Promise.all(
    workspaces.map(async (workspace): Promise<DiscoveryResult> => {
      await rateLimiter.wait();
      try {
        const response = await fetchWithRetry(new URL(`${baseUrl}/phone-numbers`), {
          headers: { Authorization: `Bearer ${workspace.apiKey}` },
        });
        if (response.status === 401 || response.status === 403) {
          return {
            status: "error",
            error: workspace.label
              ? `No access to OpenPhone numbers for workspace "${humanizeLabel(workspace.label)}". Check that key is valid.`
              : "No access to OpenPhone numbers. Check the API key is valid.",
          };
        }
        if (!response.ok) {
          return { status: "error", error: `${response.status} ${response.statusText}` };
        }
        const parsed = (await response.json()) as PhoneNumbersResponse;
        return { status: "ok", accounts: toDiscoveredAccounts(parsed.data, workspace.label) };
      } catch (err) {
        return { status: "error", error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  const accounts = perWorkspaceResults.flatMap((result) => (result.status === "ok" ? result.accounts : []));
  const errors = perWorkspaceResults.filter((result) => result.status === "error");

  if (accounts.length === 0 && errors.length > 0) {
    // Every workspace failed — surface the first error rather than a
    // generic "no accounts found."
    return errors[0];
  }

  return { status: "ok", accounts };
}
