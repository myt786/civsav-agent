import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, PlatformAccount, DateRange } from "../types";
import { fetchRawInsights } from "./client";
import { metaResponseSchema, metaDataSchema, type MetaData } from "./schema";

const DATE_FORMAT = "yyyy-MM-dd";

function leadsFromActions(actions: { action_type: string; value: string }[] | undefined): number {
  const leadAction = actions?.find((action) => action.action_type === "lead");
  return leadAction ? Number(leadAction.value) : 0;
}

export const metaConnector: Connector<MetaData> = {
  platform: "meta",
  schema: metaDataSchema,

  async fetch(account: PlatformAccount, range: DateRange): Promise<ConnectorResult<MetaData>> {
    let raw: unknown;
    try {
      raw = await fetchRawInsights(account, range);
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    const parsed = metaResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", error: parsed.error.message };
    }

    if (parsed.data.data.length === 0) {
      return { status: "no_data", raw };
    }

    // spend/impressions/clicks arrive as strings — Number(...) explicitly,
    // never string concatenation, which is silent and produces garbage.
    const spend = parsed.data.data.reduce((sum, row) => sum + Number(row.spend), 0);
    const impressions = parsed.data.data.reduce((sum, row) => sum + Number(row.impressions), 0);
    const clicks = parsed.data.data.reduce((sum, row) => sum + Number(row.clicks), 0);
    const results = parsed.data.data.reduce((sum, row) => sum + leadsFromActions(row.actions), 0);

    const [firstRow] = parsed.data.data;

    // Bucketed on the client's own timezone — never the platform's default
    // and never the server's.
    const data: MetaData = {
      spend,
      impressions,
      clicks,
      results,
      cpl: results === 0 ? null : spend / results,
      deliveryStatus: firstRow.effective_status,
      attributionWindow: firstRow.attribution_setting,
      rangeStart: formatInTimeZone(range.start, account.clientTimezone, DATE_FORMAT),
      rangeEnd: formatInTimeZone(range.end, account.clientTimezone, DATE_FORMAT),
    };

    const dataParsed = metaDataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },
};
