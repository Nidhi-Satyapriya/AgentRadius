import { z } from "zod";
import { CONFIDENCES, SEVERITIES } from "./vocabulary.ts";

export const FINDING_STATUSES = [
  "open",
  "accepted_risk",
  "in_progress",
  "resolved",
  "false_positive",
] as const;

/**
 * A risk conclusion produced by a versioned rule. Findings are derived from the graph and are
 * never stored as graph facts, so observed data and conclusions stay separate.
 */
export const FindingSchema = z.strictObject({
  /** Stable for identical (ruleId, affected entities); re-running analysis does not duplicate it. */
  id: z.string().min(1),
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  title: z.string().min(1).max(300),
  severity: z.enum(SEVERITIES),
  /** Confidence in the evidence behind the finding; independent of severity. */
  confidence: z.enum(CONFIDENCES),
  status: z.enum(FINDING_STATUSES),
  affectedEntityIds: z.array(z.string()).min(1),
  pathEdgeIds: z.array(z.string()),
  rationale: z.string().min(1),
  assumptions: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  remediation: z.array(z.string()).min(1),
  relatedControlIds: z.array(z.string()),
  /** The analysis evaluation time (`asOf`), not wall-clock time, so output is reproducible. */
  detectedAt: z.iso.datetime({ offset: true }),
  evidenceIsStale: z.boolean(),
});

export type Finding = z.infer<typeof FindingSchema>;
