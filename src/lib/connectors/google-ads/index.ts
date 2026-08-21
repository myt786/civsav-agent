import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, PlatformAccount, DateRange } from "../types";
import { fetchRawCampaignReport } from "./client";
import {
  googleAdsResponseSchema,
  googleAdsDataSchema,
  microsToCurrency,
  type GoogleAdsData,
} from "./schema";

const DATE_FORMAT = "yyyy-MM-dd";

export const googleAdsConnector: Connector<GoogleAdsData> = {
  platform: "google_ads",
  schema: googleAdsDataSchema,

  async fetch(
    account: PlatformAccount,
    range: DateRange,
  ): Promise<ConnectorResult<GoogleAdsData>> {
    let raw: unknown;
    try {
      raw = await fetchRawCampaignReport(account, range);
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    const parsed = googleAdsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", error: parsed.error.message };
    }

    if (parsed.data.length === 0) {
      return { status: "no_data", raw };
    }

    const impressions = parsed.data.reduce((sum, row) => sum + row.metrics.impressions, 0);
    const clicks = parsed.data.reduce((sum, row) => sum + row.metrics.clicks, 0);
    const conversions = parsed.data.reduce((sum, row) => sum + row.metrics.conversions, 0);
    const costMicros = parsed.data.reduce((sum, row) => sum + row.metrics.cost_micros, 0);
    const cost = microsToCurrency(costMicros);

    // Bucketed on the client's own timezone — never the platform's default
    // and never the server's.
    const data: GoogleAdsData = {
      impressions,
      clicks,
      cost,
      conversions,
      cpl: conversions === 0 ? null : cost / conversions,
      rangeStart: formatInTimeZone(range.start, account.clientTimezone, DATE_FORMAT),
      rangeEnd: formatInTimeZone(range.end, account.clientTimezone, DATE_FORMAT),
    };

    const dataParsed = googleAdsDataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },
};
