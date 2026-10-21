import {
  EDGE_SEMANTICS,
  lowerConfidence,
  weakerAssertion,
  type Action,
  type Assertion,
  type Confidence,
} from "../domain/index.ts";
import { incomingEdges, type GraphIndex } from "../graph/index.ts";

/** One direct (single-hop) permission statement, or a permission node expanded to its resource. */
export interface PermissionRow {
  readonly holderId: string;
  readonly permissionId: string | null;
  readonly resourceId: string;
  readonly action: Action;
  readonly assertion: Assertion;
  readonly confidence: Confidence;
  readonly scopes: readonly string[];
  readonly edgeIds: readonly string[];
}

/**
 * Human-readable inventory of declared and observed permissions. This is not effective access:
 * use blast-radius analysis for multi-hop reachability.
 */
export function permissionInventory(graph: GraphIndex): PermissionRow[] {
  const rows: PermissionRow[] = [];
  for (const edge of graph.edges.values()) {
    const action = EDGE_SEMANTICS[edge.type].grantsAction;
    if (action === undefined || edge.lifecycle === "revoked") continue;
    const holder = graph.nodes.get(edge.from);
    if (holder === undefined) continue;
    if (holder.type !== "Permission") {
      rows.push({
        holderId: edge.from,
        permissionId: null,
        resourceId: edge.to,
        action,
        assertion: edge.assertion,
        confidence: edge.confidence,
        scopes: edge.scopes ?? [],
        edgeIds: [edge.id],
      });
      continue;
    }
    for (const grant of incomingEdges(graph, holder.id)) {
      if (grant.type !== "GRANTS_SCOPE" || grant.lifecycle === "revoked") continue;
      rows.push({
        holderId: grant.from,
        permissionId: holder.id,
        resourceId: edge.to,
        action,
        assertion: weakerAssertion(grant.assertion, edge.assertion),
        confidence: lowerConfidence(grant.confidence, edge.confidence),
        scopes: [...new Set([...(grant.scopes ?? []), ...(edge.scopes ?? [])])],
        edgeIds: [grant.id, edge.id],
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.holderId.localeCompare(b.holderId) ||
      a.resourceId.localeCompare(b.resourceId) ||
      a.action.localeCompare(b.action),
  );
}
