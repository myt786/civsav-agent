import { z } from "zod";

// Real API (OpenPhone, now branded Quo): the full status enum a call can
// carry — far more than the four values this connector originally
// assumed. There is no boolean `forwarded` field at all; forwarding is
// signaled either by status "forwarded" itself or by non-null
// forwardedFrom/forwardedTo, captured separately below so conflation
// never happens silently — same rule the original four-value schema's own
// comment was trying to follow, just applied to the real fields.
export const openPhoneCallStatusSchema = z.enum([
  "queued",
  "initiated",
  "ringing",
  "in-progress",
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
  "missed",
  "answered",
  "forwarded",
  "abandoned",
]);

export const openPhoneCallSchema = z.object({
  id: z.string(),
  status: openPhoneCallStatusSchema,
  duration: z.number().int().nonnegative(),
  forwardedFrom: z.string().nullable(),
  forwardedTo: z.string().nullable(),
});

// client.ts flattens every participant's paginated /v1/calls results into
// this combined shape before handing off — the real API's own per-page
// envelope ({ data, totalItems, nextPageToken }) isn't meaningful once
// multiple participants' pages are merged.
export const openPhoneResponseSchema = z.object({
  calls: z.array(openPhoneCallSchema),
});

export type OpenPhoneResponse = z.infer<typeof openPhoneResponseSchema>;

export const telephonyDataSchema = z.object({
  totalCalls: z.number().int().nonnegative(),
  // status === "missed" only — a call whose status is something else
  // (busy, failed, no-answer, canceled, abandoned) is never folded in.
  missedCalls: z.number().int().nonnegative(),
  // forwardedFrom or forwardedTo present, regardless of status.
  forwardedCalls: z.number().int().nonnegative(),
  // The overlap: missed AND forwarded. Downstream can correct the missed
  // count with missedCalls - missedAndForwardedCalls instead of the
  // discrepancy being silently baked in.
  missedAndForwardedCalls: z.number().int().nonnegative(),
  totalDurationSeconds: z.number().int().nonnegative(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type TelephonyData = z.infer<typeof telephonyDataSchema>;
