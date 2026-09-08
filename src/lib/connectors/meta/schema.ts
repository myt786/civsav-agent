import { z } from "zod";

// Graph API returns every numeric insight value as a STRING, not a
// number. Typing these as z.string() means an accidental upstream
// numeric coercion fails validation instead of silently passing through
// — parsing happens explicitly in index.ts, never implicitly here.
export const metaActionSchema = z.object({
  action_type: z.string(),
  value: z.string(),
});

export const metaInsightRowSchema = z.object({
  spend: z.string(),
  impressions: z.string(),
  clicks: z.string(),
  actions: z.array(metaActionSchema).optional(),
  // Account-level insights carry no delivery status — that concept only
  // exists per campaign/adset/ad. attribution_setting can be absent on
  // rows with no attributed conversions.
  attribution_setting: z.string().optional(),
});

export const metaResponseSchema = z.object({
  data: z.array(metaInsightRowSchema),
});

export type MetaResponse = z.infer<typeof metaResponseSchema>;

export const metaDataSchema = z.object({
  spend: z.number().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  results: z.number().int().nonnegative(),
  // null (not 0) when there are no results to divide by.
  cpl: z.number().nonnegative().nullable(),
  // Attribution windows differ from Google — recorded so a comparison
  // built later doesn't quietly assume they're the same methodology.
  // Null when Meta didn't report one for the range.
  attributionWindow: z.string().nullable(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type MetaData = z.infer<typeof metaDataSchema>;
