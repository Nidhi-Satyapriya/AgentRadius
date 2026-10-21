import type { GraphEdge, GraphNode, NodeType, EdgeType, Snapshot } from "../../src/domain/index.ts";
import { ingestSnapshot, type GraphIndex } from "../../src/graph/index.ts";

export const T0 = "2026-10-20T00:00:00Z";

export function prov(connectorId = "test", observedAt = T0) {
  return [
    {
      connectorId,
      evidenceRef: `test:${connectorId}`,
      observedAt,
      collectionMethod: "fixture" as const,
    },
  ];
}

export function n(id: string, type: NodeType, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, type, label: id, attributes: {}, provenance: prov(), ...extra };
}

export function e(
  from: string,
  type: EdgeType,
  to: string,
  extra: Partial<GraphEdge> = {},
): GraphEdge {
  return {
    id: `edge:${from}>${type}>${to}`,
    type,
    from,
    to,
    assertion: "observed",
    confidence: "high",
    lifecycle: "active",
    conditions: [],
    attributes: {},
    provenance: prov(),
    ...extra,
  };
}

export function snapshot(
  nodes: GraphNode[],
  edges: GraphEdge[],
  extra: Partial<Snapshot> = {},
): Snapshot {
  return {
    schemaVersion: "2.0",
    snapshotId: "test",
    collectedAt: T0,
    dataOrigin: "fixture",
    fixtureNotice: "Test fixture",
    environmentLabel: "test",
    nodes,
    edges,
    connectorRuns: [],
    ...extra,
  };
}

export function graphOf(nodes: GraphNode[], edges: GraphEdge[]): GraphIndex {
  const result = ingestSnapshot(snapshot(nodes, edges));
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2));
  return result.graph;
}

/**
 * Builds secret-shaped sentinel strings at runtime so that no credential-looking literal is
 * committed to source (and secret scanners stay quiet). They are random-free and obviously fake.
 */
export const SENTINEL = {
  githubToken: () => ["gh", "p_", "Z".repeat(36)].join(""),
  awsKeyId: () => ["AK", "IA", "Z".repeat(16)].join(""),
  privateKeyHeader: () => ["-----BEGIN ", "RSA ", "PRIVATE KEY-----"].join(""),
  urlWithPassword: () =>
    ["postgres://", "user", ":", "not-a-real-password", "@db.invalid/x"].join(""),
};
