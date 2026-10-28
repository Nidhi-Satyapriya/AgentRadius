import type { Action, EdgeType, GraphEdge } from "../domain/index.ts";
import { requireNode, type GraphIndex } from "../graph/index.ts";
import type { BlastRadiusResult } from "./blastRadius.ts";
import { computeBlastRadius } from "./blastRadius.ts";
import { applyChanges, impactKeys, type GraphChange } from "./simulation.ts";
import type { AnalysisSettings } from "./settings.ts";

export interface Mitigation {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly change: GraphChange;
  /** Measured by re-running the analysis with the change applied to an in-memory copy. */
  readonly impactsRemoved: number;
  readonly impactsRemaining: number;
  /** Mitigations are suggestions. MCPRadius never applies them automatically. */
  readonly requiresHumanAction: true;
}

const HIGH_IMPACT_ACTIONS: ReadonlySet<Action> = new Set(["write", "delete", "execute", "admin"]);

/** Edge types where a human can realistically cut access: connections, credentials, grants. */
const CHOKE_POINT_TYPES: ReadonlySet<EdgeType> = new Set([
  "CONNECTS_TO",
  "AUTHENTICATES_WITH",
  "HOLDS_CREDENTIAL_REFERENCE",
  "GRANTS_SCOPE",
  "ASSUMES_ROLE",
  "DELEGATES_TO",
  "EXPOSES_TOOL",
]);

const MAX_MITIGATIONS = 6;

export function suggestMitigations(
  graph: GraphIndex,
  result: BlastRadiusResult,
  settings: AnalysisSettings,
): Mitigation[] {
  const candidates = chokePointEdges(graph, result);
  const baseline = impactKeys(result).size;
  const mitigations: Mitigation[] = [];
  for (const edge of candidates) {
    const change: GraphChange = { kind: "remove_edge", edgeId: edge.id };
    const modified = applyChanges(graph, [change], result.asOf).graph;
    const remaining = impactKeys(
      computeBlastRadius(modified, result.startId, settings, result.asOf),
    ).size;
    if (remaining >= baseline) continue;
    mitigations.push({
      id: `mitigation:${edge.id}`,
      ...describe(graph, edge),
      change,
      impactsRemoved: baseline - remaining,
      impactsRemaining: remaining,
      requiresHumanAction: true,
    });
  }
  return mitigations
    .sort((a, b) => b.impactsRemoved - a.impactsRemoved || a.id.localeCompare(b.id))
    .slice(0, MAX_MITIGATIONS);
}

function chokePointEdges(graph: GraphIndex, result: BlastRadiusResult): GraphEdge[] {
  const ids = new Set<string>();
  for (const impact of result.impacts) {
    for (const a of impact.actions) {
      if (!HIGH_IMPACT_ACTIONS.has(a.action)) continue;
      for (const step of a.path.steps)
        if (CHOKE_POINT_TYPES.has(step.edgeType)) ids.add(step.edgeId);
    }
  }
  return [...ids].sort().flatMap((id) => {
    const edge = graph.edges.get(id);
    return edge === undefined ? [] : [edge];
  });
}

function describe(graph: GraphIndex, edge: GraphEdge): { title: string; rationale: string } {
  const from = requireNode(graph, edge.from).label;
  const to = requireNode(graph, edge.to).label;
  switch (edge.type) {
    case "CONNECTS_TO":
      return {
        title: `Disconnect "${to}" from "${from}", or require approval for its write tools`,
        rationale: `${from} can drive ${to}; every tool and credential behind it is in the blast radius.`,
      };
    case "AUTHENTICATES_WITH":
      return {
        title: `Give "${from}" a narrower credential than "${to}"`,
        rationale: `${from} acts with ${to}; a fine-grained, repository- or resource-scoped credential limits what its tools can reach.`,
      };
    case "GRANTS_SCOPE":
      return {
        title: `Remove or narrow "${to}" on "${from}"`,
        rationale: `The permission ${to} is the step that turns access to ${from} into access to downstream resources.`,
      };
    case "HOLDS_CREDENTIAL_REFERENCE":
      return {
        title: `Move "${to}" out of "${from}" into a secret store`,
        rationale: `Anyone who can read ${from} can obtain ${to}.`,
      };
    case "ASSUMES_ROLE":
      return {
        title: `Restrict the trust policy of "${to}"`,
        rationale: `${from} can assume ${to}; tightening the trust conditions removes this escalation step.`,
      };
    case "EXPOSES_TOOL":
      return {
        title: `Disable tool "${to}" on "${from}"`,
        rationale: `The tool ${to} is the only step granting this access through ${from}.`,
      };
    default:
      return {
        title: `Remove the ${edge.type} relationship from "${from}" to "${to}"`,
        rationale: `This relationship is on a high-impact path.`,
      };
  }
}
