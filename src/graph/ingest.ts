import {
  EDGE_SEMANTICS,
  ENFORCEMENT_STATES,
  SnapshotSchema,
  type GraphEdge,
  type GraphNode,
  type Snapshot,
} from "../domain/index.ts";
import { scanForSecrets } from "../redaction/index.ts";
import { buildAdjacency, type GraphIndex, type MergeConflict } from "./graphIndex.ts";
import { edgeKey, mergeEdges, mergeNodes } from "./merge.ts";

export type IngestIssueCode =
  | "secret_material"
  | "schema"
  | "node_type_conflict"
  | "edge_id_conflict"
  | "dangling_edge"
  | "invalid_trust_boundary"
  | "invalid_control"
  | "ungated_resource_edge"
  | "hypothetical_in_snapshot";

export interface IngestIssue {
  readonly code: IngestIssueCode;
  readonly path: string;
  readonly message: string;
}

export type IngestResult =
  | { readonly ok: true; readonly graph: GraphIndex; readonly mergedRecords: number }
  | { readonly ok: false; readonly errors: readonly IngestIssue[] };

/**
 * Validates untrusted snapshot input and builds an immutable graph index.
 * Rejects (rather than strips) secret material so that a leaking connector is noticed.
 */
export function ingestSnapshot(raw: unknown): IngestResult {
  const secretErrors = scanForSecrets(raw).map<IngestIssue>((finding) => ({
    code: "secret_material",
    path: finding.path,
    message: `Value matches secret pattern(s): ${finding.patternIds.join(", ")}. Store a credential reference instead.`,
  }));
  if (secretErrors.length > 0) return { ok: false, errors: secretErrors };

  const parsed = SnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        code: "schema",
        path: `/${issue.path.join("/")}`,
        message: issue.message,
      })),
    };
  }
  return buildGraph(parsed.data);
}

function buildGraph(snapshot: Snapshot): IngestResult {
  const errors: IngestIssue[] = [];
  const conflicts: MergeConflict[] = [];

  const nodes = mergeNodeRecords(snapshot.nodes, errors, conflicts);
  const { edges, aliases } = mergeEdgeRecords(snapshot.edges, errors, conflicts);
  validateReferences(nodes, edges, errors);
  if (errors.length > 0) return { ok: false, errors };

  const { outgoing, incoming } = buildAdjacency(edges.values());
  const graph: GraphIndex = {
    meta: {
      schemaVersion: snapshot.schemaVersion,
      snapshotId: snapshot.snapshotId,
      collectedAt: snapshot.collectedAt,
      dataOrigin: snapshot.dataOrigin,
      ...(snapshot.fixtureNotice !== undefined ? { fixtureNotice: snapshot.fixtureNotice } : {}),
      environmentLabel: snapshot.environmentLabel,
    },
    nodes,
    edges,
    outgoing,
    incoming,
    connectorRuns: snapshot.connectorRuns,
    conflicts,
    edgeAliases: aliases,
  };
  const mergedRecords = snapshot.nodes.length - nodes.size + (snapshot.edges.length - edges.size);
  return { ok: true, graph, mergedRecords };
}

function mergeNodeRecords(
  records: readonly GraphNode[],
  errors: IngestIssue[],
  conflicts: MergeConflict[],
): Map<string, GraphNode> {
  const groups = groupBy(records, (n) => n.id);
  const nodes = new Map<string, GraphNode>();
  for (const [id, group] of sortedEntries(groups)) {
    const types = new Set(group.map((n) => n.type));
    if (types.size > 1) {
      errors.push({
        code: "node_type_conflict",
        path: `/nodes[id=${id}]`,
        message: `Node ID is declared with multiple types: ${[...types].sort().join(", ")}`,
      });
      continue;
    }
    nodes.set(id, mergeNodes(group, conflicts));
  }
  return nodes;
}

function mergeEdgeRecords(
  records: readonly GraphEdge[],
  errors: IngestIssue[],
  conflicts: MergeConflict[],
): { edges: Map<string, GraphEdge>; aliases: Map<string, string> } {
  const keysById = groupBy(records, (e) => e.id);
  for (const [id, group] of sortedEntries(keysById)) {
    const keys = new Set(group.map(edgeKey));
    if (keys.size > 1) {
      errors.push({
        code: "edge_id_conflict",
        path: `/edges[id=${id}]`,
        message: "Edge ID is reused for different (from, type, to) relationships",
      });
    }
  }
  const edges = new Map<string, GraphEdge>();
  const aliases = new Map<string, string>();
  for (const [, group] of sortedEntries(groupBy(records, edgeKey))) {
    const merged = mergeEdges(group, conflicts);
    edges.set(merged.id, merged);
    for (const record of group) if (record.id !== merged.id) aliases.set(record.id, merged.id);
  }
  return { edges, aliases };
}

function validateReferences(
  nodes: ReadonlyMap<string, GraphNode>,
  edges: ReadonlyMap<string, GraphEdge>,
  errors: IngestIssue[],
): void {
  for (const node of nodes.values()) {
    if (node.trustBoundaryId === undefined) continue;
    if (nodes.get(node.trustBoundaryId)?.type !== "TrustBoundary") {
      errors.push({
        code: "invalid_trust_boundary",
        path: `/nodes[id=${node.id}]/trustBoundaryId`,
        message: "trustBoundaryId must reference a TrustBoundary node",
      });
    }
  }
  for (const node of nodes.values()) {
    if (node.type !== "Policy") continue;
    const state = node.attributes["enforcementState"];
    if (typeof state !== "string" || !(ENFORCEMENT_STATES as readonly string[]).includes(state)) {
      errors.push({
        code: "invalid_control",
        path: `/nodes[id=${node.id}]/attributes/enforcementState`,
        message: `Policy nodes must declare enforcementState as one of: ${ENFORCEMENT_STATES.join(", ")}`,
      });
    }
  }
  for (const edge of edges.values()) validateEdge(edge, nodes, errors);
}

function validateEdge(
  edge: GraphEdge,
  nodes: ReadonlyMap<string, GraphNode>,
  errors: IngestIssue[],
): void {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (from === undefined || to === undefined) {
    errors.push({
      code: "dangling_edge",
      path: `/edges[id=${edge.id}]`,
      message: `Edge references missing node(s): ${[from ? null : edge.from, to ? null : edge.to].filter(Boolean).join(", ")}`,
    });
    return;
  }
  errors.push(...edgeRuleViolations(edge, from, to));
  if (edge.assertion === "hypothetical") {
    errors.push({
      code: "hypothetical_in_snapshot",
      path: `/edges[id=${edge.id}]/assertion`,
      message: "Hypothetical edges are produced only by simulations and cannot be imported",
    });
  }
}

/** Structural rules every edge must satisfy, whether imported or simulated. */
export function edgeRuleViolations(edge: GraphEdge, from: GraphNode, to: GraphNode): IngestIssue[] {
  const issues: IngestIssue[] = [];
  if (edge.type === "CONTROLLED_BY" && to.type !== "Policy") {
    issues.push({
      code: "invalid_control",
      path: `/edges[id=${edge.id}]/to`,
      message: "CONTROLLED_BY edges must point to a Policy node",
    });
  }
  const propagates = EDGE_SEMANTICS[edge.type].propagation !== "none";
  if (propagates && from.type === "Resource" && edge.requiresAction === undefined) {
    issues.push({
      code: "ungated_resource_edge",
      path: `/edges[id=${edge.id}]/requiresAction`,
      message:
        "Edges leaving a Resource must declare requiresAction (the access needed on the resource to follow them)",
    });
  }
  return issues;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list === undefined) groups.set(k, [item]);
    else list.push(item);
  }
  return groups;
}

function sortedEntries<T>(map: Map<string, T>): [string, T][] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
