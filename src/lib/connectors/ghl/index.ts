import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, PlatformAccount, DateRange } from "../types";
import { fetchRawOpportunities } from "./client";
import { ghlResponseSchema, ghlDataSchema, type GhlData } from "./schema";

const DATE_FORMAT = "yyyy-MM-dd";

export const ghlConnector: Connector<GhlData> = {
  platform: "ghl",
  schema: ghlDataSchema,

  async fetch(account: PlatformAccount, range: DateRange): Promise<ConnectorResult<GhlData>> {
    let raw: unknown;
    try {
      raw = await fetchRawOpportunities(account, range);
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    const parsed = ghlResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", error: parsed.error.message };
    }

    if (parsed.data.opportunities.length === 0) {
      return { status: "no_data", raw };
    }

    const stageCounts = new Map<string, number>();
    for (const opportunity of parsed.data.opportunities) {
      stageCounts.set(opportunity.stageName, (stageCounts.get(opportunity.stageName) ?? 0) + 1);
    }

    // Bucketed on the client's own timezone — never the platform's default
    // and never the server's.
    const data: GhlData = {
      leadCount: parsed.data.opportunities.length,
      pipelineStages: Array.from(stageCounts, ([stage, count]) => ({ stage, count })),
      opportunityValue: parsed.data.opportunities.reduce(
        (sum, opportunity) => sum + opportunity.monetaryValue,
        0,
      ),
      rangeStart: formatInTimeZone(range.start, account.clientTimezone, DATE_FORMAT),
      rangeEnd: formatInTimeZone(range.end, account.clientTimezone, DATE_FORMAT),
    };

    const dataParsed = ghlDataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },
};
