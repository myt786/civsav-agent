import { z } from "zod";

// Raw shape of google-ads-api's customer.report() rows for a campaign
// metrics + segments.date query. Field is named cost_micros (not "cost")
// deliberately — the API returns cost in micros, and naming it anything
// else invites someone to treat it as currency by accident.
export const googleAdsRowSchema = z.object({
  metrics: z.object({
    impressions: z.number(),
    clicks: z.number(),
    cost_micros: z.number(),
    conversions: z.number(),
  }),
  segments: z.object({
    date: z.string(),
  }),
});

// customer.report() resolves to a bare row array, not a wrapper object.
export const googleAdsResponseSchema = z.array(googleAdsRowSchema);

export type GoogleAdsResponse = z.infer<typeof googleAdsResponseSchema>;

// cost_micros / 1_000_000 = currency. Explicit, named, and unit-tested on
// its own — getting this wrong produces a number off by 1,000,000x that
// still looks plausible in aggregate.
export function microsToCurrency(micros: number): number {
  return micros / 1_000_000;
}

export const googleAdsDataSchema = z.object({
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  conversions: z.number().nonnegative(),
  // null (not 0) when there are no conversions to divide by — a real CPL
  // of 0 and "can't compute CPL" must stay distinguishable.
  cpl: z.number().nonnegative().nullable(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type GoogleAdsData = z.infer<typeof googleAdsDataSchema>;
