import { z } from "zod";

// Raw shape of a Search Console searchanalytics.query response, dimensioned
// by "query" for a single day.
export const searchConsoleRowSchema = z.object({
  keys: z.array(z.string()),
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number(),
});

export const searchConsoleResponseSchema = z.object({
  rows: z.array(searchConsoleRowSchema).optional(),
  // The site's true totals for the period (a query with no dimensions).
  // Optional so older stored payloads and fixtures without it still parse;
  // the connector falls back to summing rows when it's absent.
  totals: z
    .object({ clicks: z.number(), impressions: z.number(), position: z.number() })
    .nullable()
    .optional(),
});

export type SearchConsoleResponse = z.infer<typeof searchConsoleResponseSchema>;

export const searchConsoleDataSchema = z.object({
  totalImpressions: z.number().int().nonnegative(),
  totalClicks: z.number().int().nonnegative(),
  averagePosition: z.number().nonnegative(),
  topQueries: z.array(
    z.object({
      query: z.string(),
      clicks: z.number().int().nonnegative(),
      impressions: z.number().int().nonnegative(),
      position: z.number().nonnegative(),
    }),
  ),
  // Search Console data lags 2-3 days. This is the date the data actually
  // covers, not the date the sync ran — comparisons drift if the two are
  // conflated.
  dataDate: z.string(),
});

export type SearchConsoleData = z.infer<typeof searchConsoleDataSchema>;
