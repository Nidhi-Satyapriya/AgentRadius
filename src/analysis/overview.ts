import {
  ASSERTIONS,
  enforcementStateOf,
  type Assertion,
  type ConnectorStatus,
  type EnforcementState,
  type Finding,
  type NodeType,
  type Severity,
} from "../domain/index.ts";
import { isStale, type FreshnessPolicy, type GraphIndex } from "../graph/index.ts";

export interface OverviewSummary {
  readonly nodeCounts: Partial<Record<NodeType, number>>;
  readonly edgeAssertions: Record<Assertion, number>;
  readonly staleEdges: number;
  readonly revokedEdges: number;
  readonly findingsBySeverity: Partial<Record<Severity, number>>;
  readonly connectorStatuses: Partial<Record<ConnectorStatus, number>>;
  readonly coverageGaps: readonly {
    connectorId: string;
    label: string;
    status: ConnectorStatus;
    blindSpots: number;
  }[];
  readonly controlsByEnforcement: Partial<Record<EnforcementState, number>>;
  readonly mergeConflicts: number;
}

function tally<K extends string>(keys: Iterable<K>): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
  return counts;
}

export function summarize(
  graph: GraphIndex,
  findings: readonly Finding[],
  freshness: FreshnessPolicy,
): OverviewSummary {
  const edges = [...graph.edges.values()];
  const edgeAssertions = Object.fromEntries(ASSERTIONS.map((a) => [a, 0])) as Record<
    Assertion,
    number
  >;
  for (const e of edges) edgeAssertions[e.assertion] += 1;
  const policies = [...graph.nodes.values()].filter((n) => n.type === "Policy");
  return {
    nodeCounts: tally([...graph.nodes.values()].map((n) => n.type)),
    edgeAssertions,
    staleEdges: edges.filter((e) => isStale(e.provenance, freshness)).length,
    revokedEdges: edges.filter((e) => e.lifecycle === "revoked").length,
    findingsBySeverity: tally(findings.map((f) => f.severity)),
    connectorStatuses: tally(graph.connectorRuns.map((r) => r.status)),
    coverageGaps: graph.connectorRuns
      .filter((r) => r.status !== "completed" || r.blindSpots.length > 0)
      .map((r) => ({
        connectorId: r.connectorId,
        label: r.label,
        status: r.status,
        blindSpots: r.blindSpots.length,
      })),
    controlsByEnforcement: tally(policies.flatMap((p) => enforcementStateOf(p) ?? [])),
    mergeConflicts: graph.conflicts.length,
  };
}
