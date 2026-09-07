import type { AttentionFlag, FlagKind } from "../insights/types";
import { computeAttentionFlags } from "../insights/rules";
import type { CellState, ClientRow, DashboardData } from "./types";

export type SearchParams = Record<string, string | string[] | undefined>;
export const PAGE_SIZE = 25;
export const HEALTH_LABELS = {
  critical: "Critical",
  attention: "Needs attention",
  insufficient: "Insufficient data",
  clear: "No issues detected",
} as const;
export type Health = keyof typeof HEALTH_LABELS;
const priority: Record<Health, number> = {
  critical: 0,
  attention: 1,
  insufficient: 2,
  clear: 3,
};
export const SORTS = {
  priority: "Priority",
  client: "Client name",
  leads: "Leads",
  spend: "Spend",
  cpl: "Cost per lead",
  freshness: "Data freshness",
} as const;
export type PortfolioSort = keyof typeof SORTS;
export const ISSUE_GUIDES: Record<
  FlagKind,
  { title: string; step: string; section: string; period: string }
> = {
  sync_error: {
    period: "Latest fetch attempt for the affected metric.",
    title: "Connection needs review",
    step: "Open Connections, review the reported error, and verify the affected account mapping. After correcting it, run a sync from Settings.",
    section: "connections",
  },
  stale_sync: {
    period: "Time elapsed since the latest successfully stored data.",
    title: "Data is out of date",
    step: "Review the latest sync result in Settings. Check the affected connections before running another sync.",
    section: "connections",
  },
  leads_down: {
    period: "Last 7 full days compared with the preceding 7 days.",
    title: "Lead volume is falling",
    step: "Compare lead and spend trends for the same period. Check campaign delivery and test the lead capture form before changing budgets.",
    section: "leads",
  },
  missed_calls_high: {
    period: "Missed calls as a share of all calls in the last 7 full days.",
    title: "Calls are going unanswered",
    step: "Review missed calls in OpenPhone. Check business hours, team availability, and routing, then follow up on unanswered enquiries.",
    section: "callsTotal",
  },
  position_worsening: {
    period:
      "Last 7 full days compared with available earlier days in the 30-day history.",
    title: "Search visibility is declining",
    step: "Review affected queries and pages in Search Console. Check indexing, recent website changes, and content before deciding what to update.",
    section: "avgPosition",
  },
  spend_spike: {
    period:
      "Last 7 full days compared with available earlier days in the 30-day history.",
    title: "Ad spend has increased",
    step: "Compare Google and Meta spend below. Review recent budget and campaign changes against lead volume and cost per lead.",
    section: "spend",
  },
  sessions_drop: {
    period:
      "Last 7 full days compared with available earlier days in the 30-day history.",
    title: "Website traffic has fallen",
    step: "Check the GA4 connection and tracking first, then compare acquisition channels and recent website changes to locate the drop.",
    section: "sessions",
  },
};
export function param(
  params: SearchParams,
  key: string,
  fallback = "",
): string {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}
export function pageNumber(params: SearchParams): number {
  const n = Number(param(params, "page", "1"));
  return Number.isSafeInteger(n) && n > 0 ? n : 1;
}
export function pageSlice<T>(items: T[], requested: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(Math.max(1, requested), pages);
  return {
    items: items.slice((page - 1) * size, page * size),
    total: items.length,
    page,
    pages,
    pageSize: size,
  };
}
export function queryHref(
  path: string,
  params: SearchParams,
  changes: Record<string, string | number | undefined> = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (typeof value === "string" && value) query.set(key, value);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === "") query.delete(key);
    else query.set(key, String(value));
  }
  return `${path}${query.size ? `?${query}` : ""}`;
}
export function overviewReturn(value: string) {
  // Only an overview query is accepted, never an arbitrary redirect URL.
  return value === "/" || value.startsWith("/?") ? value : "/";
}
export function hasValue<T>(
  cell: CellState<T>,
): cell is Extract<CellState<T>, { kind: "ok" | "unverified" }> {
  return cell.kind === "ok" || cell.kind === "unverified";
}
export function rowCoverage(row: ClientRow) {
  const cells: CellState<unknown>[] = [
    row.leads,
    row.calls,
    row.spend,
    row.sessions,
    row.conversions,
    row.avgPosition,
  ];
  return {
    available: cells.filter(hasValue).length,
    total: cells.length,
    unverified: cells.some((c) => c.kind === "unverified"),
  };
}
export function clientHealth(row: ClientRow, flags: AttentionFlag[]): Health {
  if (flags.some((f) => f.severity === "critical")) return "critical";
  if (flags.length) return "attention";
  if (!rowCoverage(row).available || row.lastSyncedAt === null)
    return "insufficient";
  return "clear";
}
export function flagsByClient(flags: AttentionFlag[]) {
  const map = new Map<string, AttentionFlag[]>();
  for (const flag of flags) {
    const group = map.get(flag.clientId) ?? [];
    group.push(flag);
    map.set(flag.clientId, group);
  }
  for (const group of map.values())
    group.sort(
      (a, b) =>
        Number(b.severity === "critical") - Number(a.severity === "critical"),
    );
  return map;
}
export function aggregateCoverage(rows: ClientRow[], key: "leads" | "spend") {
  const usable = rows.map((row) => row[key]).filter(hasValue);
  return {
    value: usable.length
      ? usable.reduce((sum, cell) => sum + cell.value, 0)
      : null,
    available: usable.length,
    total: rows.length,
    unverified: usable.some((c) => c.kind === "unverified"),
  };
}
export function selectPortfolio(data: DashboardData, params: SearchParams) {
  const groups = flagsByClient(computeAttentionFlags(data));
  const entries = data.rows.map((row) => ({
    row,
    flags: groups.get(row.clientId) ?? [],
    health: clientHealth(row, groups.get(row.clientId) ?? []),
    coverage: rowCoverage(row),
  }));
  const counts: Record<Health, number> = {
    critical: 0,
    attention: 0,
    insufficient: 0,
    clear: 0,
  };
  for (const entry of entries) counts[entry.health]++;
  const query = param(params, "q").trim().toLowerCase();
  const health = param(params, "health");
  const sort = Object.hasOwn(SORTS, param(params, "sort"))
    ? (param(params, "sort") as PortfolioSort)
    : "priority";
  const direction =
    param(
      params,
      "dir",
      sort === "client" || sort === "priority" ? "asc" : "desc",
    ) === "asc"
      ? 1
      : -1;
  const filtered = entries.filter(
    (e) =>
      e.row.clientName.toLowerCase().includes(query) &&
      (!Object.hasOwn(HEALTH_LABELS, health) || e.health === health),
  );
  filtered.sort((a, b) => {
    let order = 0;
    if (sort === "priority") order = priority[a.health] - priority[b.health];
    else if (sort === "client")
      order = a.row.clientName.localeCompare(b.row.clientName);
    else {
      const av =
        sort === "freshness"
          ? (a.row.lastSyncedAt?.getTime() ?? null)
          : hasValue(a.row[sort])
            ? a.row[sort].value
            : null;
      const bv =
        sort === "freshness"
          ? (b.row.lastSyncedAt?.getTime() ?? null)
          : hasValue(b.row[sort])
            ? b.row[sort].value
            : null;
      if (av === null || bv === null)
        return av === bv
          ? a.row.clientName.localeCompare(b.row.clientName)
          : av === null
            ? 1
            : -1;
      order = av - bv;
    }
    return (
      order * direction ||
      a.row.clientName.localeCompare(b.row.clientName) ||
      a.row.clientId.localeCompare(b.row.clientId)
    );
  });
  return {
    ...pageSlice(filtered, pageNumber(params)),
    counts,
    activeClients: entries.length,
    attentionClients: counts.critical + counts.attention,
    leads: aggregateCoverage(data.rows, "leads"),
    spend: aggregateCoverage(data.rows, "spend"),
  };
}
export function selectIssues(data: DashboardData, params: SearchParams) {
  const all = computeAttentionFlags(data);
  const q = param(params, "q").trim().toLowerCase();
  const severity = param(params, "severity");
  const kind = param(params, "kind");
  const filtered = all.filter(
    (f) =>
      f.clientName.toLowerCase().includes(q) &&
      (!severity || f.severity === severity) &&
      (!kind || f.kind === kind),
  );
  filtered.sort(
    (a, b) =>
      Number(b.severity === "critical") - Number(a.severity === "critical") ||
      a.clientName.localeCompare(b.clientName) ||
      a.kind.localeCompare(b.kind),
  );
  return {
    ...pageSlice(filtered, pageNumber(params)),
    issueCount: all.length,
    affectedClients: new Set(all.map((f) => f.clientId)).size,
  };
}
