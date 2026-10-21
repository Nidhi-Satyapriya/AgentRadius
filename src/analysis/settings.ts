import { z } from "zod";
import { DEFAULT_TRAVERSAL_LIMITS } from "../graph/index.ts";

/** User-tunable analysis settings. `asOf` is supplied separately by the caller. */
export const AnalysisSettingsSchema = z.strictObject({
  includeInferred: z.boolean().default(true),
  includeUnknown: z.boolean().default(false),
  includeHypothetical: z.boolean().default(false),
  maxDepth: z.number().int().min(1).max(25).default(DEFAULT_TRAVERSAL_LIMITS.maxDepth),
  maxReached: z.number().int().min(1).max(50_000).default(DEFAULT_TRAVERSAL_LIMITS.maxReached),
  stalenessThresholdHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .default(72),
});

export type AnalysisSettings = z.infer<typeof AnalysisSettingsSchema>;

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = AnalysisSettingsSchema.parse({});
