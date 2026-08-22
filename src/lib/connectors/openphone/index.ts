import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, DiscoveryResult, PlatformAccount, DateRange } from "../types";
import { openPhoneProvider, listOpenPhoneNumbers } from "./client";
import { openPhoneResponseSchema, telephonyDataSchema, type TelephonyData } from "./schema";

const DATE_FORMAT = "yyyy-MM-dd";

export const openPhoneConnector: Connector<TelephonyData> = {
  platform: "openphone",
  schema: telephonyDataSchema,

  async fetch(account: PlatformAccount, range: DateRange): Promise<ConnectorResult<TelephonyData>> {
    let raw: unknown;
    try {
      raw = await openPhoneProvider.fetchCallSummary(account, range);
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }

    const parsed = openPhoneResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", error: parsed.error.message };
    }

    if (parsed.data.calls.length === 0) {
      return { status: "no_data", raw };
    }

    const missedCalls = parsed.data.calls.filter((call) => call.status === "missed").length;
    const forwardedCalls = parsed.data.calls.filter((call) => call.forwarded).length;
    const missedAndForwardedCalls = parsed.data.calls.filter(
      (call) => call.status === "missed" && call.forwarded,
    ).length;

    // Bucketed on the client's own timezone — never the platform's default
    // and never the server's.
    const data: TelephonyData = {
      totalCalls: parsed.data.calls.length,
      missedCalls,
      forwardedCalls,
      missedAndForwardedCalls,
      totalDurationSeconds: parsed.data.calls.reduce((sum, call) => sum + call.duration, 0),
      rangeStart: formatInTimeZone(range.start, account.clientTimezone, DATE_FORMAT),
      rangeEnd: formatInTimeZone(range.end, account.clientTimezone, DATE_FORMAT),
    };

    const dataParsed = telephonyDataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },

  async listAccounts(): Promise<DiscoveryResult> {
    return listOpenPhoneNumbers();
  },
};
