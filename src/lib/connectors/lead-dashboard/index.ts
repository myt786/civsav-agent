import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, DiscoveryResult, PlatformAccount, DateRange } from "../types";
import { fetchRawLeads, listLeadDashboardClients } from "./client";
import {
  leadDashboardResponseSchema,
  leadDashboardDataSchema,
  leadStatusSchema,
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

    if (parsed.data.data.length === 0) {
      return { status: "no_data", raw };
    }

    // leadDashboardDataSchema's byStatus is a record keyed by the status
    // enum, and Zod requires every enum key present — a day with zero
    // "abandoned" leads still needs that key at 0, not absent, or
    // validation fails below. Pre-seed every status before counting.
    const byStatus: Record<string, number> = Object.fromEntries(
      leadStatusSchema.options.map((status) => [status, 0]),
    );
    let spamLeads = 0;
    for (const lead of parsed.data.data) {
      byStatus[lead.status] += 1;
      if (lead.is_spam) spamLeads += 1;
    }

    const data: LeadDashboardData = {
      totalLeads: parsed.data.data.length,
      byStatus: byStatus as LeadDashboardData["byStatus"],
      spamLeads,
      rangeStart: formatInTimeZone(range.start, account.clientTimezone, DATE_FORMAT),
      rangeEnd: formatInTimeZone(range.end, account.clientTimezone, DATE_FORMAT),
    };

    const dataParsed = leadDashboardDataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },

  async listAccounts(): Promise<DiscoveryResult> {
    return listLeadDashboardClients();
  },
};
