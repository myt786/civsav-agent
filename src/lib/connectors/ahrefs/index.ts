import { formatInTimeZone } from "date-fns-tz";
import type { Connector, ConnectorResult, DiscoveryResult, PlatformAccount, DateRange } from "../types";
import { ahrefsProvider, listAhrefsProjects } from "./client";
import {
  ahrefsResponseSchema,
  seoDataSchema,
  centsToUsd,
  KEYWORD_GAINED_STATUS,
  KEYWORD_LOST_STATUS,
  type SeoData,
} from "./schema";

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

    let keywordsGained = 0;
    let keywordsLost = 0;
    for (const row of parsed.data.keywordMovement.keywords ?? []) {
      if (row.status === KEYWORD_GAINED_STATUS) keywordsGained++;
      else if (row.status === KEYWORD_LOST_STATUS) keywordsLost++;
    }

    // Sorted ascending by date so "latest" and "prior" are unambiguous
    // regardless of the order Ahrefs returns rows in.
    const refdomainRows = [...(parsed.data.refdomainsHistory.refdomains ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const latestRefdomains = refdomainRows.at(-1)?.refdomains ?? null;
    const priorRefdomains = refdomainRows.at(-2)?.refdomains ?? null;
    const newReferringDomains =
      latestRefdomains !== null && priorRefdomains !== null ? latestRefdomains - priorRefdomains : null;

    const data: SeoData = {
      organicKeywords: metrics.org_keywords,
      organicKeywordsTop3: metrics.org_keywords_1_3,
      organicTrafficEstimate: metrics.org_traffic,
      // null means Ahrefs has no cost estimate for that side of traffic —
      // treated as no cost to report, not a missing/error value.
      organicCostValue: centsToUsd(metrics.org_cost ?? 0),
      paidKeywords: metrics.paid_keywords,
      paidTrafficEstimate: metrics.paid_traffic,
      paidCostValue: centsToUsd(metrics.paid_cost ?? 0),
      paidPages: metrics.paid_pages,
      keywordsGained,
      keywordsLost,
      referringDomains: latestRefdomains,
      newReferringDomains,
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
