import { readFile } from "node:fs/promises";
import path from "node:path";
import { formatInTimeZone } from "date-fns-tz";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { PlatformAccount, DateRange, DiscoveryResult } from "../types";

// Configurable per connector, per the contract's rate-limit requirement.
const rateLimiter = new RateLimiter({ requestsPerSecond: 5 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "lead-dashboard");

// API max; minimizes round-trips through the pagination loop below.
const PER_PAGE = 100;

// GET /api/sites and GET /api/sites/{site}/leads are both Laravel-style
// paginated resource collections. Field names beyond current_page/last_page
// aren't documented, so pagination state is read defensively — a response
// with no `meta` (or a `meta` missing these fields) is treated as a single,
// final page rather than looping forever.
interface Page<T> {
  data?: T[];
  meta?: { current_page?: number; last_page?: number };
}

async function fetchAllPages<T>(
  buildUrl: (page: number) => URL,
  apiKey: string,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    await rateLimiter.wait();
    const response = await fetchWithRetry(buildUrl(page), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new HttpError(response.status, `${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as Page<T>;
    items.push(...(body.data ?? []));

    const currentPage = body.meta?.current_page ?? page;
    const lastPage = body.meta?.last_page ?? currentPage;
    if (!body.meta || currentPage >= lastPage) break;
    page += 1;
  }
  return items;
}

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

  // date_from/date_to filter on created_at as dates, not timestamps —
  // bucketed on the client's own timezone, never the platform's or the
  // server's.
  const dateFrom = formatInTimeZone(range.start, account.clientTimezone, "yyyy-MM-dd");
  const dateTo = formatInTimeZone(range.end, account.clientTimezone, "yyyy-MM-dd");

  const leads = await fetchAllPages(
    (page) => {
      const url = new URL(`${baseUrl}/api/sites/${account.externalId}/leads`);
      url.searchParams.set("per_page", String(PER_PAGE));
      url.searchParams.set("page", String(page));
      url.searchParams.set("date_from", dateFrom);
      url.searchParams.set("date_to", dateTo);
      return url;
    },
    apiKey,
  );

  return { data: leads };
}

interface Site {
  id: string | number;
  name: string;
}

export async function listLeadDashboardClients(): Promise<DiscoveryResult> {
  if (process.env.CONNECTOR_MODE === "fixture") {
    const fixtureName = process.env.LEAD_DASHBOARD_ACCOUNTS_FIXTURE ?? "accounts.json";
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      const parsed = JSON.parse(raw) as { data: Site[] };
      return {
        status: "ok",
        accounts: parsed.data.map((site) => ({ id: String(site.id), name: site.name })),
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

  try {
    // Sites are the locations. CLIENT-role keys are auto-scoped server-side
    // to their assigned sites (not a query param); ADMIN-role keys see all.
    const sites = await fetchAllPages<Site>((page) => {
      const url = new URL(`${baseUrl}/api/sites`);
      url.searchParams.set("per_page", String(PER_PAGE));
      url.searchParams.set("page", String(page));
      return url;
    }, apiKey);

    return { status: "ok", accounts: sites.map((site) => ({ id: String(site.id), name: site.name })) };
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
      return {
        status: "error",
        error: "No access to the lead dashboard site list. Check the API key is valid.",
      };
    }
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
