import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, PlatformAccount, DateRange } from "../types";
import { ahrefsProvider } from "./client";
import { ahrefsResponseSchema, seoDataSchema, type SeoData } from "./schema";

const DATE_FORMAT = "yyyy-MM-dd";

export const ahrefsConnector: Connector<SeoData> = {
  platform: "ahrefs",
  schema: seoDataSchema,

  async fetch(account: PlatformAccount, range: DateRange): Promise<ConnectorResult<SeoData>> {
    let raw: unknown;
    try {
      raw = await ahrefsProvider.fetchSummary(account, range);
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    const parsed = ahrefsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", error: parsed.error.message };
    }

    if (parsed.data.metrics === null) {
      return { status: "no_data", raw };
    }

    // Bucketed on the client's own timezone — never the platform's default
    // and never the server's.
    const data: SeoData = {
      domainRating: parsed.data.metrics.domain_rating,
      trafficEstimate: parsed.data.metrics.org_traffic,
      keywordPositions: parsed.data.metrics.keywords_summary,
      rangeStart: formatInTimeZone(range.start, account.clientTimezone, DATE_FORMAT),
      rangeEnd: formatInTimeZone(range.end, account.clientTimezone, DATE_FORMAT),
    };

    const dataParsed = seoDataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },
};
