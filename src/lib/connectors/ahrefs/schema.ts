import { z } from "zod";

// Summary metrics only, per the platform note — domain rating, tracked
// keyword position counts, traffic estimate. No full keyword exports; a
// per-keyword list is a different (and far more expensive) API call.
export const ahrefsMetricsSchema = z.object({
  domain_rating: z.number(),
  org_traffic: z.number(),
  keywords_summary: z.object({
    top3: z.number().int().nonnegative(),
    top10: z.number().int().nonnegative(),
    top100: z.number().int().nonnegative(),
  }),
});

// metrics is null when Ahrefs has no crawl data for the domain yet — a
// real absence, not a zero.
export const ahrefsResponseSchema = z.object({
  metrics: ahrefsMetricsSchema.nullable(),
});

export type AhrefsResponse = z.infer<typeof ahrefsResponseSchema>;

export const seoDataSchema = z.object({
  domainRating: z.number().nonnegative(),
  trafficEstimate: z.number().int().nonnegative(),
  keywordPositions: z.object({
    top3: z.number().int().nonnegative(),
    top10: z.number().int().nonnegative(),
    top100: z.number().int().nonnegative(),
  }),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type SeoData = z.infer<typeof seoDataSchema>;
