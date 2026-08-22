import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveryResult } from "../types";

// Configurable per connector, per the contract's rate-limit requirement.
const rateLimiter = new RateLimiter({ requestsPerSecond: 5 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "lead-dashboard");

export async function fetchRawLeads(
  account: PlatformAccount,
  range: DateRange,
): Promise<unknown> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.LEAD_DASHBOARD_FIXTURE ?? "success.json";
    const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
    return JSON.parse(raw);
  }

  const baseUrl = process.env.LEAD_DASHBOARD_API_BASE_URL;
  const apiKey = process.env.LEAD_DASHBOARD_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("LEAD_DASHBOARD_API_BASE_URL / LEAD_DASHBOARD_API_KEY not configured");
  }

  await rateLimiter.wait();

  const url = new URL(`${baseUrl}/leads`);
  url.searchParams.set("locationId", account.externalId);
  url.searchParams.set("start", range.start.toISOString());
  url.searchParams.set("end", range.end.toISOString());

  const response = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new HttpError(response.status, `${response.status} ${response.statusText}`);
  }

  return response.json();
}

interface ClientsResponse {
  data: { id: string; name: string }[];
}

export async function listLeadDashboardClients(): Promise<DiscoveryResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.LEAD_DASHBOARD_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as ClientsResponse;
      return {
        status: "ok",
        accounts: parsed.data.map((entry) => ({ id: entry.id, name: entry.name })),
      };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const baseUrl = process.env.LEAD_DASHBOARD_API_BASE_URL;
  const apiKey = process.env.LEAD_DASHBOARD_API_KEY;
  if (!baseUrl || !apiKey) {
    return { status: "error", error: "LEAD_DASHBOARD_API_BASE_URL / LEAD_DASHBOARD_API_KEY not configured." };
  }

  await rateLimiter.wait();

  const url = new URL(`${baseUrl}/clients`);

  try {
    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.status === 401 || response.status === 403) {
      return {
        status: "error",
        error: "No access to the lead dashboard client list. Check the API key is valid.",
      };
    }
    if (!response.ok) {
      return { status: "error", error: `${response.status} ${response.statusText}` };
    }
    const parsed = (await response.json()) as ClientsResponse;
    return {
      status: "ok",
      accounts: parsed.data.map((entry) => ({ id: entry.id, name: entry.name })),
    };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
