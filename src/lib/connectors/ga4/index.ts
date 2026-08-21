import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, PlatformAccount, DateRange } from "../types";
import { fetchRawAnalyticsReport } from "./client";
import { ga4ResponseSchema, ga4DataSchema, type Ga4Data } from "./schema";

const DATE_FORMAT = "yyyy-MM-dd";

export const ga4Connector: Connector<Ga4Data> = {
  platform: "ga4",
  schema: ga4DataSchema,

  async fetch(account: PlatformAccount, range: DateRange): Promise<ConnectorResult<Ga4Data>> {
    let raw: unknown;
    try {
      raw = await fetchRawAnalyticsReport(account, range);
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    const parsed = ga4ResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", error: parsed.error.message };
    }

    const trafficSourceRows = parsed.data.trafficSourceReport.rows ?? [];
    if (trafficSourceRows.length === 0) {
      return { status: "no_data", raw };
    }

    const trafficSources = trafficSourceRows.map((row) => ({
      source: row.dimensionValues[0].value,
      sessions: Number(row.metricValues[0].value),
      conversions: Number(row.metricValues[1].value),
    }));

    const conversionEventRows = parsed.data.conversionEventReport.rows ?? [];
    const conversionEvents = conversionEventRows
      .map((row) => ({
        eventName: row.dimensionValues[0].value,
        conversions: Number(row.metricValues[0].value),
      }))
      .filter((event) => event.conversions > 0);

    // Bucketed on the client's own timezone — never the platform's default
    // and never the server's.
    const data: Ga4Data = {
      totalSessions: trafficSources.reduce((sum, source) => sum + source.sessions, 0),
      totalConversions: trafficSources.reduce((sum, source) => sum + source.conversions, 0),
      trafficSources,
      conversionEvents,
      rangeStart: formatInTimeZone(range.start, account.clientTimezone, DATE_FORMAT),
      rangeEnd: formatInTimeZone(range.end, account.clientTimezone, DATE_FORMAT),
    };

    const dataParsed = ga4DataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },
};
