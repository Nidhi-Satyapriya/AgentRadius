import type { ConnectorRun, DataOrigin, GraphEdge, GraphNode } from "../domain/index.ts";

export interface SnapshotMeta {
  readonly schemaVersion: string;
  readonly snapshotId: string;
  readonly collectedAt: string;
  readonly dataOrigin: DataOrigin;
  readonly fixtureNotice?: string;
  readonly environmentLabel: string;
}

/** Explicit record of disagreeing observations that were merged into one entity. */
export interface MergeConflict {
  readonly entityId: string;
  readonly field: string;
  readonly keptValue: string;
  readonly discardedValues: readonly string[];
  readonly resolution: string;
}

/** Immutable, validated, indexed graph. Construct only through `ingestSnapshot`. */
export interface GraphIndex {
  readonly meta: SnapshotMeta;
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly edges: ReadonlyMap<string, GraphEdge>;
  readonly outgoing: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly incoming: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly connectorRuns: readonly ConnectorRun[];
  readonly conflicts: readonly MergeConflict[];
  /** Duplicate edge IDs that were merged, mapped to their canonical edge ID. */
  readonly edgeAliases: ReadonlyMap<string, string>;
}

const EMPTY: readonly GraphEdge[] = Object.freeze([]);

export function outgoingEdges(graph: GraphIndex, nodeId: string): readonly GraphEdge[] {
  return graph.outgoing.get(nodeId) ?? EMPTY;
}

export function incomingEdges(graph: GraphIndex, nodeId: string): readonly GraphEdge[] {
  return graph.incoming.get(nodeId) ?? EMPTY;
}

export function requireNode(graph: GraphIndex, nodeId: string): GraphNode {
  const node = graph.nodes.get(nodeId);
  if (node === undefined) throw new Error(`Unknown node: ${nodeId}`);
  return node;
}

export function buildAdjacency(edges: Iterable<GraphEdge>): {
  outgoing: Map<string, GraphEdge[]>;
  incoming: Map<string, GraphEdge[]>;
} {
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    push(outgoing, edge.from, edge);
    push(incoming, edge.to, edge);
  }
  for (const list of outgoing.values()) list.sort(byId);
  for (const list of incoming.values()) list.sort(byId);
  return { outgoing, incoming };
}

function push(map: Map<string, GraphEdge[]>, key: string, edge: GraphEdge): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [edge]);
  else list.push(edge);
}

export function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
