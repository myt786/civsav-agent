import { z } from "zod";

export const ghlOpportunitySchema = z.object({
  id: z.string(),
  stageName: z.string(),
  monetaryValue: z.number(),
});

export const ghlResponseSchema = z.object({
  opportunities: z.array(ghlOpportunitySchema),
});

export type GhlResponse = z.infer<typeof ghlResponseSchema>;

export const ghlDataSchema = z.object({
  leadCount: z.number().int().nonnegative(),
  pipelineStages: z.array(
    z.object({
      stage: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  opportunityValue: z.number().nonnegative(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type GhlData = z.infer<typeof ghlDataSchema>;
