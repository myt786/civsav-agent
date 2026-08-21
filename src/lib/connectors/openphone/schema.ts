import { z } from "zod";

// A forwarded call is often flagged status "missed" by OpenPhone even
// though it was handled elsewhere — status and forwarded are captured as
// separate fields so that conflation never happens silently.
export const openPhoneCallSchema = z.object({
  id: z.string(),
  status: z.enum(["completed", "missed", "voicemail", "abandoned"]),
  duration: z.number().int().nonnegative(),
  forwarded: z.boolean(),
});

export const openPhoneResponseSchema = z.object({
  calls: z.array(openPhoneCallSchema),
});

export type OpenPhoneResponse = z.infer<typeof openPhoneResponseSchema>;

export const telephonyDataSchema = z.object({
  totalCalls: z.number().int().nonnegative(),
  // Raw "missed" status count exactly as reported — may include calls
  // that were actually forwarded and handled.
  missedCalls: z.number().int().nonnegative(),
  forwardedCalls: z.number().int().nonnegative(),
  // The overlap: calls flagged missed AND forwarded. Downstream can
  // correct the missed count with missedCalls - missedAndForwardedCalls
  // instead of the discrepancy being silently baked in.
  missedAndForwardedCalls: z.number().int().nonnegative(),
  totalDurationSeconds: z.number().int().nonnegative(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type TelephonyData = z.infer<typeof telephonyDataSchema>;
