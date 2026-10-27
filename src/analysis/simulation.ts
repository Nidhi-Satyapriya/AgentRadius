import { z } from "zod";
import {
  ACTIONS,
  ATTRIBUTE_KEYS,
  EDGE_TYPES,
  EntityIdSchema,
  type Action,
  type EdgeType,
  type GraphEdge,
  type GraphNode,
} from "../domain/index.ts";
import { buildAdjacency, edgeRuleViolations, type GraphIndex } from "../graph/index.ts";
import { computeBlastRadius, type BlastRadiusResult } from "./blastRadius.ts";
import type { AnalysisSettings } from "./settings.ts";

export const GraphChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("remove_edge"), edgeId: z.string().min(1) }),
  /** Models a verified deny control on a node; used to ask "what if this were enforced?". */
  z.strictObject({ kind: z.literal("add_enforced_deny"), nodeId: EntityIdSchema }),
  /** Models a newly granted relationship; used to ask "what would this grant expose?". */
  z.strictObject({
    kind: z.literal("add_edge"),
    from: EntityIdSchema,
    type: z.enum(EDGE_TYPES.filter((t) => t !== "CONTROLLED_BY") as [EdgeType, ...EdgeType[]]),
    to: EntityIdSchema,
    requiresAction: z.enum(ACTIONS).optional(),
  }),
]);
export type GraphChange = z.infer<typeof GraphChangeSchema>;

export const SIMULATION_NOTICE =
  "Simulated on an in-memory copy of the graph. Nothing was changed on this computer, in any configuration file, or at any provider.";

const SIMULATION_SOURCE = {
  connectorId: "agentradius.simulation",
  evidenceRef: "simulation:in-memory",
  collectionMethod: "inference_rule",
} as const;

export interface ChangeOutcome {
  readonly change: GraphChange;
  readonly applied: boolean;
  readonly reason?: string;
}

export function applyChanges(
  graph: GraphIndex,
  changes: readonly GraphChange[],
  asOf: string,
): { graph: GraphIndex; outcomes: ChangeOutcome[] } {
  const nodes = new Map<string, GraphNode>(graph.nodes);
  const edges = new Map<string, GraphEdge>(graph.edges);
  const outcomes = changes.map((change) => applyOne(change, nodes, edges, asOf));
  const { outgoing, incoming } = buildAdjacency(edges.values());
  return { graph: { ...graph, nodes, edges, outgoing, incoming }, outcomes };
}

function applyOne(
  change: GraphChange,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
  asOf: string,
): ChangeOutcome {
  const provenance = [{ ...SIMULATION_SOURCE, observedAt: asOf }];
  if (change.kind === "remove_edge") {
    if (!edges.delete(change.edgeId)) return { change, applied: false, reason: "Unknown edge" };
    return { change, applied: true };
  }
  if (change.kind === "add_edge") {
    const from = nodes.get(change.from);
    const to = nodes.get(change.to);
    if (from === undefined || to === undefined)
      return { change, applied: false, reason: "Unknown node" };
    if (from.id === to.id)
      return { change, applied: false, reason: "An entity cannot relate to itself" };
    const edge: GraphEdge = {
      id: `edge:simulated:${change.from}>${change.type.toLowerCase()}>${change.to}`,
      type: change.type,
      from: change.from,
      to: change.to,
      assertion: "hypothetical",
      confidence: "high",
      lifecycle: "active",
      ...(change.requiresAction ? { requiresAction: change.requiresAction } : {}),
      conditions: [],
      attributes: {},
      provenance,
    };
    const violations = edgeRuleViolations(edge, from, to);
    if (violations.length > 0) {
      return { change, applied: false, reason: violations.map((v) => v.message).join("; ") };
    }
    edges.set(edge.id, edge);
    return { change, applied: true };
  }
  if (!nodes.has(change.nodeId)) return { change, applied: false, reason: "Unknown node" };
  const policyId = `policy:simulated-deny:${change.nodeId}`;
  nodes.set(policyId, {
    id: policyId,
    type: "Policy",
    label: "Simulated enforced deny",
    attributes: {
      [ATTRIBUTE_KEYS.enforcementState]: "enforced_verified",
      [ATTRIBUTE_KEYS.controlEffect]: "deny",
      simulated: true,
    },
    provenance,
  });
  const edgeId = `edge:simulated-control:${change.nodeId}`;
  edges.set(edgeId, {
    id: edgeId,
    type: "CONTROLLED_BY",
    from: change.nodeId,
    to: policyId,
    assertion: "hypothetical",
    confidence: "high",
    lifecycle: "active",
    conditions: [],
    attributes: {},
    provenance,
  });
  return { change, applied: true };
}

export interface ImpactKey {
  readonly resourceId: string;
  readonly action: Action;
}

export interface SimulationResult {
  readonly notice: string;
  readonly startId: string;
  readonly outcomes: readonly ChangeOutcome[];
  readonly before: BlastRadiusResult;
  readonly after: BlastRadiusResult;
  readonly reachabilityRemoved: readonly string[];
  readonly reachabilityAdded: readonly string[];
  readonly impactsRemoved: readonly ImpactKey[];
  readonly impactsAdded: readonly ImpactKey[];
  readonly impactsRemaining: readonly ImpactKey[];
}

export function simulateChanges(
  graph: GraphIndex,
  startId: string,
  changes: readonly GraphChange[],
  settings: AnalysisSettings,
  asOf: string,
): SimulationResult {
  const before = computeBlastRadius(graph, startId, settings, asOf);
  const modified = applyChanges(graph, changes, asOf);
  // Snapshots cannot contain hypothetical edges (ingestion rejects them), so the only
  // hypothetical edges followed here are the ones this simulation introduced.
  const after = computeBlastRadius(
    modified.graph,
    startId,
    { ...settings, includeHypothetical: true },
    asOf,
  );
  const beforeReached = new Set(before.reached.map((r) => r.nodeId));
  const afterReached = new Set(after.reached.map((r) => r.nodeId));
  const beforeImpacts = impactKeys(before);
  const afterImpacts = impactKeys(after);
  return {
    notice: SIMULATION_NOTICE,
    startId,
    outcomes: modified.outcomes,
    before,
    after,
    reachabilityRemoved: [...beforeReached].filter((id) => !afterReached.has(id)).sort(),
    reachabilityAdded: [...afterReached].filter((id) => !beforeReached.has(id)).sort(),
    impactsRemoved: difference(beforeImpacts, afterImpacts),
    impactsAdded: difference(afterImpacts, beforeImpacts),
    impactsRemaining: [...afterImpacts.values()].filter((k) => beforeImpacts.has(serialize(k))),
  };
}

export function impactKeys(result: BlastRadiusResult): Map<string, ImpactKey> {
  const keys = new Map<string, ImpactKey>();
  for (const impact of result.impacts) {
    for (const a of impact.actions) {
      const key = { resourceId: impact.resourceId, action: a.action };
      keys.set(serialize(key), key);
    }
  }
  return keys;
}

function serialize(key: ImpactKey): string {
  return `${key.resourceId}|${key.action}`;
}

function difference(a: Map<string, ImpactKey>, b: Map<string, ImpactKey>): ImpactKey[] {
  return [...a.entries()].filter(([k]) => !b.has(k)).map(([, v]) => v);
}
