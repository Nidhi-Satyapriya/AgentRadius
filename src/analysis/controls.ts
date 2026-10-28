import {
  controlEffectOf,
  enforcementStateOf,
  type ControlEffect,
  type EnforcementState,
} from "../domain/index.ts";
import { outgoingEdges, type GraphIndex } from "../graph/index.ts";

export interface ControlRef {
  readonly policyId: string;
  readonly label: string;
  readonly governedNodeId: string;
  readonly enforcementState: EnforcementState;
  readonly effect: ControlEffect | "unspecified";
  /** True only for verified, enforced deny controls. Everything else is informational. */
  readonly limitsPropagation: boolean;
  readonly explanation: string;
}

const STATE_EXPLANATION: Record<EnforcementState, string> = {
  enforced_verified:
    "Enforced at a verified interception point; denied requests were tested not to reach the upstream.",
  monitor_only: "Observes and records activity but does not block anything.",
  advisory: "A recommendation only; nothing intercepts the traffic.",
  external_declared:
    "Declared by an external system (e.g. a provider setting); MCPRadius has not verified it.",
  not_enforceable: "MCPRadius cannot mediate this path, so the control cannot be applied here.",
};

export function controlsGoverning(graph: GraphIndex, nodeId: string): ControlRef[] {
  const refs: ControlRef[] = [];
  for (const edge of outgoingEdges(graph, nodeId)) {
    if (edge.type !== "CONTROLLED_BY" || edge.lifecycle === "revoked") continue;
    const policy = graph.nodes.get(edge.to);
    const state = policy === undefined ? undefined : enforcementStateOf(policy);
    if (policy === undefined || state === undefined) continue;
    const effect = controlEffectOf(policy) ?? "unspecified";
    const limitsPropagation = state === "enforced_verified" && effect === "deny";
    refs.push({
      policyId: policy.id,
      label: policy.label,
      governedNodeId: nodeId,
      enforcementState: state,
      effect,
      limitsPropagation,
      explanation: STATE_EXPLANATION[state],
    });
  }
  return refs;
}

/** Nodes whose onward propagation is stopped by a verified, enforced deny control. */
export function containedNodes(graph: GraphIndex): Map<string, string> {
  const contained = new Map<string, string>();
  for (const nodeId of [...graph.nodes.keys()].sort()) {
    const blocking = controlsGoverning(graph, nodeId).find((c) => c.limitsPropagation);
    if (blocking !== undefined) contained.set(nodeId, blocking.policyId);
  }
  return contained;
}
