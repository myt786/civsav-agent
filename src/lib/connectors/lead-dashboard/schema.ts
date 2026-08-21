import { z } from "zod";

// Assumption (flagged, not specified by the platform blocks): the lead
// dashboard is a generic REST lead-tracking API returning a flat list of
// leads for an account within a date range.
export const leadRecordSchema = z.object({
  id: z.string(),
  status: z.enum(["new", "contacted", "qualified", "won", "lost"]),
  createdAt: z.iso.datetime(),
});

export const leadDashboardResponseSchema = z.object({
  leads: z.array(leadRecordSchema),
});

export type LeadDashboardResponse = z.infer<typeof leadDashboardResponseSchema>;

export const leadDashboardDataSchema = z.object({
  totalLeads: z.number().int().nonnegative(),
  byStatus: z.record(
    z.enum(["new", "contacted", "qualified", "won", "lost"]),
    z.number().int().nonnegative(),
  ),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type LeadDashboardData = z.infer<typeof leadDashboardDataSchema>;
