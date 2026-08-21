import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, PlatformAccount, DateRange } from "../types";
import { fetchRawLeads } from "./client";
import {
  leadDashboardResponseSchema,
  leadDashboardDataSchema,
  type LeadDashboardData,
} from "./schema";

const DATE_FORMAT = "yyyy-MM-dd";

export const leadDashboardConnector: Connector<LeadDashboardData> = {
  platform: "lead_dashboard",
  schema: leadDashboardDataSchema,

  async fetch(
    account: PlatformAccount,
    range: DateRange,
  ): Promise<ConnectorResult<LeadDashboardData>> {
    let raw: unknown;
    try {
      raw = await fetchRawLeads(account, range);
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    const parsed = leadDashboardResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", error: parsed.error.message };
    }

    if (parsed.data.leads.length === 0) {
      return { status: "no_data", raw };
    }

    // Bucketed on the client's own timezone — never the platform's default
    // and never the server's.
    const byStatus: Record<string, number> = {};
    for (const lead of parsed.data.leads) {
      byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
    }

    const data: LeadDashboardData = {
      totalLeads: parsed.data.leads.length,
      byStatus: byStatus as LeadDashboardData["byStatus"],
      rangeStart: formatInTimeZone(range.start, account.clientTimezone, DATE_FORMAT),
      rangeEnd: formatInTimeZone(range.end, account.clientTimezone, DATE_FORMAT),
    };

    const dataParsed = leadDashboardDataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },
};
