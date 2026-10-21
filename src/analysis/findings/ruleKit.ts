import type { Confidence, Finding, Severity } from "../../domain/index.ts";
import { isStale, type GraphIndex } from "../../graph/index.ts";
import type { BlastRadiusResult } from "../blastRadius.ts";
import type { AnalysisSettings } from "../settings.ts";

export interface RuleContext {
  readonly graph: GraphIndex;
  readonly settings: AnalysisSettings;
  readonly asOf: string;
  /** Memoized per start node so overlapping rules do not recompute traversals. */
  readonly blastRadius: (startId: string) => BlastRadiusResult;
}

export interface FindingRule {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  evaluate(context: RuleContext): Finding[];
}

export interface FindingDraft {
  readonly title: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly affectedEntityIds: readonly string[];
  readonly pathEdgeIds: readonly string[];
  readonly rationale: string;
  readonly assumptions?: readonly string[];
  readonly remediation: readonly string[];
  readonly relatedControlIds?: readonly string[];
}

export function makeFinding(rule: FindingRule, context: RuleContext, draft: FindingDraft): Finding {
  const affected = [...new Set(draft.affectedEntityIds)];
  const edges = draft.pathEdgeIds.flatMap((id) => {
    const edge = context.graph.edges.get(id);
    return edge === undefined ? [] : [edge];
  });
  const freshness = {
    asOf: context.asOf,
    stalenessThresholdHours: context.settings.stalenessThresholdHours,
  };
  return {
    id: `finding:${rule.id}:${[...affected].sort().join("+")}`,
    ruleId: rule.id,
    ruleVersion: rule.version,
    title: draft.title,
    severity: draft.severity,
    confidence: draft.confidence,
    status: "open",
    affectedEntityIds: affected,
    pathEdgeIds: [...draft.pathEdgeIds],
    rationale: draft.rationale,
    assumptions: [...(draft.assumptions ?? [])],
    evidenceRefs: [...new Set(edges.flatMap((e) => e.provenance.map((p) => p.evidenceRef)))].sort(),
    remediation: [...draft.remediation],
    relatedControlIds: [...new Set(draft.relatedControlIds ?? [])].sort(),
    detectedAt: context.asOf,
    evidenceIsStale: edges.some((e) => isStale(e.provenance, freshness)),
  };
}

export function label(context: RuleContext, id: string): string {
  return context.graph.nodes.get(id)?.label ?? id;
}
