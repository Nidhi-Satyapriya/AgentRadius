import type { Action, Assertion, Confidence } from "../domain/index.ts";
import type { GraphIndex } from "../graph/index.ts";
import { computeBlastRadius } from "./blastRadius.ts";
import type { AnalysisSettings } from "./settings.ts";

export interface ReachCell {
  readonly agentId: string;
  readonly resourceId: string;
  /** Actions with an access path. Empty means reachable, but what it can do there is unknown. */
  readonly actions: readonly Action[];
  /** Weakest evidence on the strongest path to the resource. */
  readonly assertion: Assertion;
  readonly confidence: Confidence;
}

export interface ReachMatrix {
  readonly agentIds: readonly string[];
  readonly resourceIds: readonly string[];
  readonly cells: readonly ReachCell[];
}

/** Agent × resource summary of each agent's blast radius. Deterministic: rows and columns by ID. */
export function reachMatrix(
  graph: GraphIndex,
  settings: AnalysisSettings,
  asOf: string,
): ReachMatrix {
  const agentIds = [...graph.nodes.values()]
    .filter((n) => n.type === "Agent")
    .map((n) => n.id)
    .sort();
  const cells: ReachCell[] = [];
  for (const agentId of agentIds) {
    const result = computeBlastRadius(graph, agentId, settings, asOf);
    const impacts = new Map(result.impacts.map((i) => [i.resourceId, i]));
    for (const reached of result.reached) {
      if (reached.nodeType !== "Resource") continue;
      cells.push({
        agentId,
        resourceId: reached.nodeId,
        actions: (impacts.get(reached.nodeId)?.actions ?? []).map((a) => a.action),
        assertion: reached.path.assertion,
        confidence: reached.path.confidence,
      });
    }
  }
  const resourceIds = [...new Set(cells.map((c) => c.resourceId))].sort();
  return {
    agentIds: agentIds.filter((id) => cells.some((c) => c.agentId === id)),
    resourceIds,
    cells,
  };
}
