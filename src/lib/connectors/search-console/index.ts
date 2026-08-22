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
    if (rows.length === 0) {
      return { status: "no_data", raw };
    }

    const totalClicks = rows.reduce((sum, row) => sum + row.clicks, 0);
    const totalImpressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const averagePosition =
      totalImpressions === 0
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
