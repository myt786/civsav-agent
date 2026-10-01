import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, DiscoveryResult, PlatformAccount, DateRange } from "../types";
import { fetchRawSearchAnalytics, listSearchConsoleSites } from "./client";
import {
  searchConsoleResponseSchema,
  searchConsoleDataSchema,
  type SearchConsoleData,
} from "./schema";

const DATE_FORMAT = "yyyy-MM-dd";
const TOP_QUERIES_LIMIT = 5;

export const searchConsoleConnector: Connector<SearchConsoleData> = {
  platform: "search_console",
  schema: searchConsoleDataSchema,

  async fetch(
    account: PlatformAccount,
    range: DateRange,
  ): Promise<ConnectorResult<SearchConsoleData>> {
    let raw: unknown;
    try {
      raw = await fetchRawSearchAnalytics(account, range);
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    const parsed = searchConsoleResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", error: parsed.error.message };
    }

    const rows = parsed.data.rows ?? [];
    const totals = parsed.data.totals ?? null;
    if (rows.length === 0 && (!totals || totals.impressions === 0)) {
      return { status: "no_data", raw };
    }

    // Prefer the site-level totals; summing query rows only covers the top
    // 25 queries. The fallback keeps older payloads/fixtures working.
    const totalClicks = totals ? Math.round(totals.clicks) : rows.reduce((sum, row) => sum + row.clicks, 0);
    const totalImpressions = totals
      ? Math.round(totals.impressions)
      : rows.reduce((sum, row) => sum + row.impressions, 0);
    const averagePosition = totals
      ? totals.position
      : totalImpressions === 0
        ? rows.reduce((sum, row) => sum + row.position, 0) / rows.length
        : rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / totalImpressions;

    const topQueries = [...rows]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, TOP_QUERIES_LIMIT)
      .map((row) => ({
        query: row.keys[0] ?? "",
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
      }));

    // Bucketed on the client's own timezone — never the platform's default
    // and never the server's.
    const data: SearchConsoleData = {
      totalImpressions,
      totalClicks,
      averagePosition,
      topQueries,
      dataDate: formatInTimeZone(range.start, account.clientTimezone, DATE_FORMAT),
    };

    const dataParsed = searchConsoleDataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },

  async listAccounts(): Promise<DiscoveryResult> {
    return listSearchConsoleSites();
  },
};
