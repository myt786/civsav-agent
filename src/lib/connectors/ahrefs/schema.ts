import { z } from "zod";

// Real API: GET /site-explorer/metrics?target=&date= — a single-day
// snapshot (Ahrefs metrics are a point-in-time crawl estimate, not an
// aggregate over a period), not the date_from/date_to range the connector
// originally assumed. No domain_rating or top3/10/100 keyword-position
// buckets here — those live behind other Ahrefs endpoints entirely; this
// one reports organic vs. paid keyword/traffic/cost counts.
export const ahrefsMetricsSchema = z.object({
  org_keywords: z.number(),
  paid_keywords: z.number(),
  org_keywords_1_3: z.number(),
  org_traffic: z.number(),
  // USD cents, per Ahrefs API convention — never rename before converting.
  // Converted in exactly one place: centsToUsd below. Confirmed live:
  // null (not 0) when Ahrefs has no cost estimate for that side of
  // traffic — e.g. a site with zero paid keywords returns paid_cost:
  // null, and a totally uncrawled domain returns org_cost: null too.
  org_cost: z.number().nullable(),
  paid_traffic: z.number(),
  paid_cost: z.number().nullable(),
  paid_pages: z.number(),
});

// Raw shape of GET /site-explorer/organic-keywords with date/date_compared
// set (a keyword-movement comparison, select=status). "status" carries
// other values too (Ahrefs' own "both"/unchanged case) — only "left"
// (gained) and "right" (lost) are counted, so this is typed loosely
// (z.string()) rather than as a closed enum; an unrecognized status is
// legitimately ignored, not an error.
export const ahrefsKeywordMovementRowSchema = z.object({
  status: z.string(),
});

export const ahrefsKeywordMovementResponseSchema = z.object({
  keywords: z.array(ahrefsKeywordMovementRowSchema).optional(),
});

// Raw shape of GET /site-explorer/refdomains-history with
// history_grouping=monthly — one row per calendar month in the requested
// window.
export const ahrefsRefdomainsRowSchema = z.object({
  date: z.string(),
  refdomains: z.number(),
});

export const ahrefsRefdomainsHistoryResponseSchema = z.object({
  refdomains: z.array(ahrefsRefdomainsRowSchema).optional(),
});

// metrics is null when Ahrefs has no crawl data for the domain yet — a
// real absence, not a zero. keywordMovement/refdomainsHistory ride along
// in the same envelope (three calls combined by client.ts, same pattern
// ga4 uses for its two report calls) but don't gate emptiness themselves —
// a domain with crawl data but no keyword movement or referring-domain
// history yet is still "ok", just with those two fields at their own
// null/zero defaults downstream.
export const ahrefsResponseSchema = z.object({
  metrics: ahrefsMetricsSchema.nullable(),
  keywordMovement: ahrefsKeywordMovementResponseSchema,
  refdomainsHistory: ahrefsRefdomainsHistoryResponseSchema,
});

export type AhrefsResponse = z.infer<typeof ahrefsResponseSchema>;

// Ahrefs' own gained/lost vocabulary for a date vs. date_compared keyword
// comparison — "left" ranks newly (gained), "right" dropped out (lost).
// Named here so the counting logic in index.ts isn't a bare string literal.
export const KEYWORD_GAINED_STATUS = "left";
export const KEYWORD_LOST_STATUS = "right";

// USD cents -> dollars. The one place this division happens — same
// discipline as google-ads' microsToCurrency: get this wrong and every
// downstream number is off by 100x while still looking plausible.
export function centsToUsd(cents: number): number {
  return cents / 100;
}

export const seoDataSchema = z.object({
  organicKeywords: z.number().nonnegative(),
  organicKeywordsTop3: z.number().nonnegative(),
  organicTrafficEstimate: z.number().nonnegative(),
  organicCostValue: z.number().nonnegative(),
  paidKeywords: z.number().nonnegative(),
  paidTrafficEstimate: z.number().nonnegative(),
  paidCostValue: z.number().nonnegative(),
  paidPages: z.number().nonnegative(),
  // Count of keywords newly ranking / dropped out of ranking over the
  // trailing month (date vs. date one month prior). Always a real count —
  // zero means "none moved," never "we don't know."
  keywordsGained: z.number().int().nonnegative(),
  keywordsLost: z.number().int().nonnegative(),
  // Latest month's referring-domains count, and its delta vs. the prior
  // month. Both null (not zero) when Ahrefs' refdomains-history has fewer
  // data points than needed — a real "don't know yet," distinct from a
  // real zero-domain or zero-change result.
  referringDomains: z.number().int().nonnegative().nullable(),
  newReferringDomains: z.number().nullable(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type SeoData = z.infer<typeof seoDataSchema>;
