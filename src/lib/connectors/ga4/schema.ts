import { z } from "zod";

// Raw shape of a GA4 Data API runReport response. Every value — dimension
// AND metric — comes back as a string, same trap as Meta's spend field.
// Parse explicitly; never trust it to coerce.
export const ga4RowSchema = z.object({
  dimensionValues: z.array(z.object({ value: z.string() })),
  metricValues: z.array(z.object({ value: z.string() })),
});

export const ga4ReportSchema = z.object({
  rows: z.array(ga4RowSchema).optional(),
});

// Two separate reports: sessions/conversions dimensioned by traffic
// source, and conversions dimensioned by event name. Combining both into
// one dimensioned-by-eventName query would double-count sessions across
// event rows, so they're kept as two calls.
export const ga4ResponseSchema = z.object({
  trafficSourceReport: ga4ReportSchema,
  conversionEventReport: ga4ReportSchema,
});

export type Ga4Response = z.infer<typeof ga4ResponseSchema>;

export const ga4DataSchema = z.object({
  totalSessions: z.number().int().nonnegative(),
  // Conversion counts are currently unreliable — GA4 is counting
  // phone-number taps as conversions. The number is pulled as-is, but
  // conversionEvents below names exactly which events contributed to it,
  // so the discrepancy is visible rather than hidden.
  totalConversions: z.number().int().nonnegative(),
  trafficSources: z.array(
    z.object({
      source: z.string(),
      sessions: z.number().int().nonnegative(),
      conversions: z.number().int().nonnegative(),
    }),
  ),
  conversionEvents: z.array(
    z.object({
      eventName: z.string(),
      conversions: z.number().int().nonnegative(),
    }),
  ),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type Ga4Data = z.infer<typeof ga4DataSchema>;
