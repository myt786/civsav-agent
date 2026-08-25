import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, DiscoveryResult, PlatformAccount, DateRange } from "../types";
import { ahrefsProvider, listAhrefsProjects } from "./client";
import { ahrefsResponseSchema, seoDataSchema, centsToUsd, type SeoData } from "./schema";

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

    // A single-day snapshot — rangeStart/rangeEnd are the same date, kept
    // as a pair only for shape consistency with the other connectors.
    const snapshotDate = formatInTimeZone(range.end, account.clientTimezone, DATE_FORMAT);
    const metrics = parsed.data.metrics;
    const data: SeoData = {
      organicKeywords: metrics.org_keywords,
      organicKeywordsTop3: metrics.org_keywords_1_3,
      organicTrafficEstimate: metrics.org_traffic,
      organicCostValue: centsToUsd(metrics.org_cost),
      paidKeywords: metrics.paid_keywords,
      paidTrafficEstimate: metrics.paid_traffic,
      paidCostValue: centsToUsd(metrics.paid_cost),
      paidPages: metrics.paid_pages,
      rangeStart: snapshotDate,
      rangeEnd: snapshotDate,
    };

    const dataParsed = seoDataSchema.safeParse(data);
    if (!dataParsed.success) {
      return { status: "error", error: dataParsed.error.message };
    }

    return { status: "ok", data: dataParsed.data, raw };
  },

  async listAccounts(): Promise<DiscoveryResult> {
    return listAhrefsProjects();
  },
};
