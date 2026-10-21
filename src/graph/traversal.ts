import { EDGE_SEMANTICS, compareConfidence, type Action, type GraphEdge } from "../domain/index.ts";
import { byId, incomingEdges, outgoingEdges, type GraphIndex } from "./graphIndex.ts";
import { EMPTY_PATH, extendPath, type FreshnessPolicy, type PathSummary } from "./paths.ts";

export interface TraversalOptions extends FreshnessPolicy {
  readonly maxDepth: number;
  readonly maxReached: number;
  readonly includeInferred: boolean;
  readonly includeUnknown: boolean;
  readonly includeHypothetical: boolean;
  /**
   * Nodes that may be reached but not expanded, with the reason (e.g. a verified enforced control).
   * Supplied by analysis; traversal itself knows nothing about policies.
   */
  readonly containedNodes: ReadonlyMap<string, string>;
}

export const DEFAULT_TRAVERSAL_LIMITS = { maxDepth: 10, maxReached: 5_000 } as const;

export type ExclusionReason =
  | "revoked"
  | "condition_does_not_hold"
  | "unknown_excluded"
  | "inferred_excluded"
  | "hypothetical_excluded"
  | "required_access_not_reached"
  | "depth_limit";

export interface ReachedNode {
  readonly nodeId: string;
  readonly path: PathSummary;
  /** Set when the node was reached but not expanded because a control contains it. */
  readonly containedBy?: string;
}

export interface HeldAccess {
  readonly nodeId: string;
  readonly action: Action;
  readonly path: PathSummary;
}

export interface ExcludedEdge {
  readonly edgeId: string;
  readonly reason: ExclusionReason;
}

export interface TraversalResult {
  readonly startId: string;
  /** Sorted by path length, then node ID. Excludes the start node. */
  readonly reached: readonly ReachedNode[];
  /** Access (read/write/...) obtained on reached nodes, one witness path per (node, action). */
  readonly access: readonly HeldAccess[];
  /** Edges adjacent to the reached set that were not followed, with the reason. */
  readonly excluded: readonly ExcludedEdge[];
  readonly truncated: "depth_limit" | "node_limit" | null;
}

interface Candidate {
  readonly edge: GraphEdge;
  readonly nextId: string;
  readonly direction: "forward" | "reverse";
}

interface QueueItem {
  readonly nodeId: string;
  readonly path: PathSummary;
}

/**
 * Deterministic breadth-first reachability from `startId` under explicit edge-eligibility rules.
 *
 * Witness paths are the first found in breadth-first order with candidate edges ordered by
 * confidence (high first) then edge ID, so they are shortest by hop count. Edges with
 * `requiresAction` are followed only once that access is held on the node, using the path that
 * obtained the access. Each (node, action) pair is recorded once, so the walk terminates on cycles.
 */
export function traverse(
  graph: GraphIndex,
  startId: string,
  options: TraversalOptions,
): TraversalResult {
  if (!graph.nodes.has(startId)) throw new Error(`Unknown start node: ${startId}`);

  const reached = new Map<string, ReachedNode>([[startId, { nodeId: startId, path: EMPTY_PATH }]]);
  const access = new Map<string, Map<Action, PathSummary>>();
  const excluded = new Map<string, ExclusionReason>();
  const waitingForAccess = new Set<string>();
  const followed = new Set<string>();
  const queue: QueueItem[] = [{ nodeId: startId, path: EMPTY_PATH }];
  let truncated: TraversalResult["truncated"] = null;

  for (let head = 0; head < queue.length; head++) {
    const item = queue[head]!;
    if (item.nodeId !== startId && options.containedNodes.has(item.nodeId)) continue;

    for (const { edge, nextId, direction } of candidates(graph, item.nodeId)) {
      const reason = ineligibility(edge, options);
      if (reason !== null) {
        excluded.set(edge.id, reason);
        continue;
      }
      let base = item.path;
      if (edge.requiresAction !== undefined) {
        const witness = access.get(item.nodeId)?.get(edge.requiresAction);
        if (witness === undefined) {
          waitingForAccess.add(edge.id);
          continue;
        }
        base = witness;
      }
      if (base.steps.length + 1 > options.maxDepth) {
        excluded.set(edge.id, "depth_limit");
        truncated ??= "depth_limit";
        continue;
      }
      const path = extendPath(base, edge, direction, options);
      followed.add(edge.id);
      const gainedAccess = recordAccess(access, nextId, edge, path);

      const existing = reached.get(nextId);
      if (existing === undefined) {
        if (reached.size - 1 >= options.maxReached) {
          truncated = "node_limit";
          continue;
        }
        const containedBy = options.containedNodes.get(nextId);
        reached.set(nextId, { nodeId: nextId, path, ...(containedBy ? { containedBy } : {}) });
        queue.push({ nodeId: nextId, path });
      } else if (gainedAccess) {
        // New access on an already-reached node may unlock its action-gated edges.
        queue.push({ nodeId: nextId, path: existing.path });
      }
    }
  }

  for (const edgeId of waitingForAccess) {
    if (!followed.has(edgeId) && !excluded.has(edgeId)) {
      excluded.set(edgeId, "required_access_not_reached");
    }
  }
  for (const edgeId of followed) excluded.delete(edgeId);

  reached.delete(startId);
  return {
    startId,
    reached: [...reached.values()].sort(
      (a, b) =>
        a.path.steps.length - b.path.steps.length || byId({ id: a.nodeId }, { id: b.nodeId }),
    ),
    access: flattenAccess(access),
    excluded: [...excluded.entries()]
      .map(([edgeId, reason]) => ({ edgeId, reason }))
      .sort((a, b) => byId({ id: a.edgeId }, { id: b.edgeId })),
    truncated,
  };
}

function candidates(graph: GraphIndex, nodeId: string): Candidate[] {
  const list: Candidate[] = [];
  for (const edge of outgoingEdges(graph, nodeId)) {
    if (EDGE_SEMANTICS[edge.type].propagation === "forward") {
      list.push({ edge, nextId: edge.to, direction: "forward" });
    }
  }
  for (const edge of incomingEdges(graph, nodeId)) {
    if (EDGE_SEMANTICS[edge.type].propagation === "reverse") {
      list.push({ edge, nextId: edge.from, direction: "reverse" });
    }
  }
  return list.sort(
    (a, b) => compareConfidence(a.edge.confidence, b.edge.confidence) || byId(a.edge, b.edge),
  );
}

function ineligibility(edge: GraphEdge, options: TraversalOptions): ExclusionReason | null {
  if (edge.lifecycle === "revoked") return "revoked";
  if (edge.conditions.some((c) => c.state === "does_not_hold")) return "condition_does_not_hold";
  if (edge.assertion === "unknown" && !options.includeUnknown) return "unknown_excluded";
  if (edge.assertion === "inferred" && !options.includeInferred) return "inferred_excluded";
  if (edge.assertion === "hypothetical" && !options.includeHypothetical) {
    return "hypothetical_excluded";
  }
  return null;
}

function recordAccess(
  access: Map<string, Map<Action, PathSummary>>,
  nodeId: string,
  edge: GraphEdge,
  path: PathSummary,
): boolean {
  const action = EDGE_SEMANTICS[edge.type].grantsAction;
  if (action === undefined) return false;
  const held = access.get(nodeId) ?? new Map<Action, PathSummary>();
  access.set(nodeId, held);
  if (held.has(action)) return false;
  held.set(action, path);
  return true;
}

function flattenAccess(access: Map<string, Map<Action, PathSummary>>): HeldAccess[] {
  const list: HeldAccess[] = [];
  for (const [nodeId, held] of access) {
    for (const [action, path] of held) list.push({ nodeId, action, path });
  }
  return list.sort(
    (a, b) => byId({ id: a.nodeId }, { id: b.nodeId }) || a.action.localeCompare(b.action),
  );
}
