import {
  hasNetworkEgress,
  sensitivityOf,
  type Action,
  type NodeType,
  type Sensitivity,
} from "../domain/index.ts";
import {
  boundaryCrossings,
  requireNode,
  traverse,
  type BoundaryCrossing,
  type ExclusionReason,
  type GraphIndex,
  type PathSummary,
  type TraversalResult,
} from "../graph/index.ts";
import { containedNodes, controlsGoverning, type ControlRef } from "./controls.ts";
import type { AnalysisSettings } from "./settings.ts";

export const COMPROMISE_ASSUMPTION =
  "The starting entity is fully controlled by an attacker: it can issue any request it is able to issue and use any credential it can reach.";

export const REACHABILITY_DISCLAIMER =
  "Results describe technical reachability under the stated assumption and the collected evidence. They are not confirmed exploitability, and edges that were not collected are not proof that access is impossible.";

export interface ReachedEntity {
  readonly nodeId: string;
  readonly nodeType: NodeType;
  readonly path: PathSummary;
  readonly crossings: readonly BoundaryCrossing[];
  readonly containedBy?: string;
}

export interface ActionImpact {
  readonly action: Action;
  readonly path: PathSummary;
  readonly crossings: readonly BoundaryCrossing[];
}

export interface ResourceImpact {
  readonly resourceId: string;
  readonly sensitivity: Sensitivity | "unclassified";
  readonly actions: readonly ActionImpact[];
}

/** Read access to a resource plus a reachable egress-capable node: a hypothesis, not an observation. */
export interface ExfiltrationHypothesis {
  readonly resourceId: string;
  readonly egressNodeId: string;
  readonly readPath: PathSummary;
  readonly egressPath: PathSummary;
}

export interface ExcludedEdgeDetail {
  readonly edgeId: string;
  readonly reason: ExclusionReason;
}

export interface BlastRadiusResult {
  readonly startId: string;
  readonly assumption: string;
  readonly disclaimer: string;
  readonly asOf: string;
  readonly settings: AnalysisSettings;
  readonly reached: readonly ReachedEntity[];
  readonly reachedByType: Readonly<Partial<Record<NodeType, number>>>;
  readonly impacts: readonly ResourceImpact[];
  readonly exfiltration: readonly ExfiltrationHypothesis[];
  readonly boundaryCrossings: readonly BoundaryCrossing[];
  readonly controls: readonly ControlRef[];
  readonly uncertainty: {
    readonly inferredPaths: number;
    readonly stalePaths: number;
    readonly conditionalPaths: number;
    readonly excludedEdges: readonly ExcludedEdgeDetail[];
  };
  readonly truncated: TraversalResult["truncated"];
}

export function computeBlastRadius(
  graph: GraphIndex,
  startId: string,
  settings: AnalysisSettings,
  asOf: string,
): BlastRadiusResult {
  requireNode(graph, startId);
  const traversal = traverse(graph, startId, {
    ...settings,
    asOf,
    containedNodes: containedNodes(graph),
  });

  const reached: ReachedEntity[] = traversal.reached.map((r) => ({
    nodeId: r.nodeId,
    nodeType: requireNode(graph, r.nodeId).type,
    path: r.path,
    crossings: boundaryCrossings(graph, r.path),
    ...(r.containedBy !== undefined ? { containedBy: r.containedBy } : {}),
  }));

  const impacts = resourceImpacts(graph, traversal);
  const paths = [
    ...reached.map((r) => r.path),
    ...impacts.flatMap((i) => i.actions.map((a) => a.path)),
  ];

  return {
    startId,
    assumption: COMPROMISE_ASSUMPTION,
    disclaimer: REACHABILITY_DISCLAIMER,
    asOf,
    settings,
    reached,
    reachedByType: countByType(reached),
    impacts,
    exfiltration: exfiltrationHypotheses(graph, reached, impacts),
    boundaryCrossings: uniqueCrossings(reached),
    controls: [startId, ...reached.map((r) => r.nodeId)].flatMap((id) =>
      controlsGoverning(graph, id),
    ),
    uncertainty: {
      inferredPaths: paths.filter((p) => p.assertion === "inferred").length,
      stalePaths: paths.filter((p) => p.staleEdgeIds.length > 0).length,
      conditionalPaths: paths.filter((p) => p.conditionalEdgeIds.length > 0).length,
      excludedEdges: traversal.excluded,
    },
    truncated: traversal.truncated,
  };
}

function resourceImpacts(graph: GraphIndex, traversal: TraversalResult): ResourceImpact[] {
  const byResource = new Map<string, ActionImpact[]>();
  for (const held of traversal.access) {
    if (requireNode(graph, held.nodeId).type !== "Resource") continue;
    const list = byResource.get(held.nodeId) ?? [];
    list.push({
      action: held.action,
      path: held.path,
      crossings: boundaryCrossings(graph, held.path),
    });
    byResource.set(held.nodeId, list);
  }
  return [...byResource.entries()].map(([resourceId, actions]) => ({
    resourceId,
    sensitivity: sensitivityOf(requireNode(graph, resourceId)) ?? "unclassified",
    actions,
  }));
}

function exfiltrationHypotheses(
  graph: GraphIndex,
  reached: readonly ReachedEntity[],
  impacts: readonly ResourceImpact[],
): ExfiltrationHypothesis[] {
  const egress = reached.find((r) => hasNetworkEgress(requireNode(graph, r.nodeId)));
  if (egress === undefined) return [];
  const hypotheses: ExfiltrationHypothesis[] = [];
  for (const impact of impacts) {
    const read = impact.actions.find((a) => a.action === "read");
    if (read === undefined) continue;
    hypotheses.push({
      resourceId: impact.resourceId,
      egressNodeId: egress.nodeId,
      readPath: read.path,
      egressPath: egress.path,
    });
  }
  return hypotheses;
}

function countByType(reached: readonly ReachedEntity[]): Partial<Record<NodeType, number>> {
  const counts: Partial<Record<NodeType, number>> = {};
  for (const r of reached) counts[r.nodeType] = (counts[r.nodeType] ?? 0) + 1;
  return counts;
}

function uniqueCrossings(reached: readonly ReachedEntity[]): BoundaryCrossing[] {
  const seen = new Map<string, BoundaryCrossing>();
  for (const r of reached) for (const c of r.crossings) seen.set(c.edgeId, c);
  return [...seen.values()].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
}
