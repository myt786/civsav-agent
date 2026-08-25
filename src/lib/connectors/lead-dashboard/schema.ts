import { z } from "zod";

// Real API (leaman.civsav.com): GET /api/sites/{site}/leads, a Laravel-style
// paginated resource collection — { data: [...], meta: { current_page,
// last_page, ... } }. Status is only ever completed/abandoned — NOT the
// generic new/contacted/qualified/won/lost enum this connector originally
// assumed before the real API spec was available.
export const leadStatusSchema = z.enum(["completed", "abandoned"]);

export const leadRecordSchema = z.object({
  id: z.union([z.string(), z.number()]),
  status: leadStatusSchema,
  is_spam: z.boolean(),
  created_at: z.string(),
});

// client.ts flattens every page it fetches into one combined { data: [...] }
// object before handing it here, so `meta` (a single page's pagination
// info) isn't meaningful on the combined raw value and is never read.
export const leadDashboardResponseSchema = z.object({
  data: z.array(leadRecordSchema),
});

export type LeadDashboardResponse = z.infer<typeof leadDashboardResponseSchema>;

export const leadDashboardDataSchema = z.object({
  totalLeads: z.number().int().nonnegative(),
  byStatus: z.record(leadStatusSchema, z.number().int().nonnegative()),
  // Spam is reported alongside the total, never subtracted from it by the
  // connector — same "preserve, don't resolve" rule openphone's missed/
  // forwarded overlap follows. Downstream decides what counts as a "real"
  // lead.
  spamLeads: z.number().int().nonnegative(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type LeadDashboardData = z.infer<typeof leadDashboardDataSchema>;
