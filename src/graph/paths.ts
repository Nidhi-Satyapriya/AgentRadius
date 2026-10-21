import {
  lowerConfidence,
  weakerAssertion,
  type Assertion,
  type Confidence,
  type EdgeType,
  type GraphEdge,
  type Provenance,
} from "../domain/index.ts";
import type { GraphIndex } from "./graphIndex.ts";
import { latestObservation } from "./merge.ts";

export interface PathStep {
  readonly edgeId: string;
  readonly edgeType: EdgeType;
  /** Node the step leaves from, in traversal order (differs from edge.from for reverse edges). */
  readonly fromId: string;
  readonly toId: string;
  readonly direction: "forward" | "reverse";
}

/** A witness path plus the weakest evidence along it. */
export interface PathSummary {
  readonly steps: readonly PathStep[];
  readonly assertion: Assertion;
  readonly confidence: Confidence;
  readonly staleEdgeIds: readonly string[];
  readonly conditionalEdgeIds: readonly string[];
}

export interface FreshnessPolicy {
  /** Evaluation instant (ISO-8601). Passed explicitly so analysis stays deterministic. */
  readonly asOf: string;
  readonly stalenessThresholdHours: number;
}

export const EMPTY_PATH: PathSummary = Object.freeze({
  steps: [],
  assertion: "observed",
  confidence: "high",
  staleEdgeIds: [],
  conditionalEdgeIds: [],
});

const MS_PER_HOUR = 3_600_000;

export function isStale(provenance: readonly Provenance[], freshness: FreshnessPolicy): boolean {
  const latest = latestObservation(provenance);
  if (latest === "") return true;
  const ageHours = (Date.parse(freshness.asOf) - Date.parse(latest)) / MS_PER_HOUR;
  return ageHours > freshness.stalenessThresholdHours;
}

export function hasUnresolvedCondition(edge: GraphEdge): boolean {
  return edge.conditions.some((c) => c.state === "unresolved");
}

export function extendPath(
  base: PathSummary,
  edge: GraphEdge,
  direction: PathStep["direction"],
  freshness: FreshnessPolicy,
): PathSummary {
  const fromId = direction === "forward" ? edge.from : edge.to;
  const toId = direction === "forward" ? edge.to : edge.from;
  return {
    steps: [...base.steps, { edgeId: edge.id, edgeType: edge.type, fromId, toId, direction }],
    assertion: weakerAssertion(base.assertion, edge.assertion),
    confidence: lowerConfidence(base.confidence, edge.confidence),
    staleEdgeIds: isStale(edge.provenance, freshness)
      ? [...base.staleEdgeIds, edge.id]
      : base.staleEdgeIds,
    conditionalEdgeIds: hasUnresolvedCondition(edge)
      ? [...base.conditionalEdgeIds, edge.id]
      : base.conditionalEdgeIds,
  };
}

export interface BoundaryCrossing {
  readonly edgeId: string;
  readonly fromBoundaryId: string;
  readonly toBoundaryId: string;
}

/** Steps whose endpoints sit in different, known trust boundaries. Unknown boundaries never count. */
export function boundaryCrossings(graph: GraphIndex, path: PathSummary): BoundaryCrossing[] {
  const crossings: BoundaryCrossing[] = [];
  for (const step of path.steps) {
    const fromBoundary = graph.nodes.get(step.fromId)?.trustBoundaryId;
    const toBoundary = graph.nodes.get(step.toId)?.trustBoundaryId;
    if (fromBoundary !== undefined && toBoundary !== undefined && fromBoundary !== toBoundary) {
      crossings.push({
        edgeId: step.edgeId,
        fromBoundaryId: fromBoundary,
        toBoundaryId: toBoundary,
      });
    }
  }
  return crossings;
}
