import { z } from "zod";

// Real API: GET /opportunities/search. Confirmed live against a client
// with real opportunities — there is no stageName field at all. Stage is
// only ever an opaque pipelineStageId; resolving it to a human-readable
// name would need a separate call to /opportunities/pipelines, not
// implemented here.
export const ghlOpportunitySchema = z.object({
  id: z.string(),
  pipelineStageId: z.string(),
  monetaryValue: z.number(),
});

// client.ts flattens every page it fetches (cursor-paginated via
// startAfter/startAfterId) into this combined shape before handing off.
export const ghlResponseSchema = z.object({
  opportunities: z.array(ghlOpportunitySchema),
});

export type GhlResponse = z.infer<typeof ghlResponseSchema>;

export const ghlDataSchema = z.object({
  leadCount: z.number().int().nonnegative(),
  pipelineStages: z.array(
    z.object({
      // A pipelineStageId (opaque UUID), not a human-readable name — see
      // the raw schema's comment.
      stage: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  opportunityValue: z.number().nonnegative(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type GhlData = z.infer<typeof ghlDataSchema>;
