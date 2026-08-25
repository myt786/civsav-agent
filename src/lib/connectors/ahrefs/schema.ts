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
  // Converted in exactly one place: centsToUsd below.
  org_cost: z.number(),
  paid_traffic: z.number(),
  paid_cost: z.number(),
  paid_pages: z.number(),
});

// metrics is null when Ahrefs has no crawl data for the domain yet — a
// real absence, not a zero.
export const ahrefsResponseSchema = z.object({
  metrics: ahrefsMetricsSchema.nullable(),
});

export type AhrefsResponse = z.infer<typeof ahrefsResponseSchema>;

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
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type SeoData = z.infer<typeof seoDataSchema>;
