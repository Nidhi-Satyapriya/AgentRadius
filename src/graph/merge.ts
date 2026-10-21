import {
  higherConfidence,
  strongerAssertion,
  type Attributes,
  type Condition,
  type GraphEdge,
  type GraphNode,
  type Provenance,
} from "../domain/index.ts";
import type { MergeConflict } from "./graphIndex.ts";

/**
 * Deduplication rules (documented in docs/data-model.md):
 * - Nodes merge only when their IDs are identical. Display names never trigger a merge.
 * - Edges merge when (from, type, to) are identical; the lexicographically smallest ID is canonical.
 * - Provenance from every source is preserved.
 * - Disagreeing scalar values are resolved in favor of the most recently observed record and
 *   reported as a MergeConflict; they are never dropped silently.
 */

export function edgeKey(edge: Pick<GraphEdge, "from" | "type" | "to">): string {
  return `${edge.from}|${edge.type}|${edge.to}`;
}

export function mergeProvenance(records: readonly Provenance[][]): Provenance[] {
  const seen = new Map<string, Provenance>();
  for (const list of records) {
    for (const p of list) {
      const key = `${p.connectorId}|${p.evidenceRef}|${p.observedAt}|${p.collectionMethod}`;
      if (!seen.has(key)) seen.set(key, p);
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.observedAt === b.observedAt
      ? a.connectorId.localeCompare(b.connectorId)
      : a.observedAt < b.observedAt
        ? 1
        : -1,
  );
}

export function latestObservation(provenance: readonly Provenance[]): string {
  return provenance.reduce((max, p) => (p.observedAt > max ? p.observedAt : max), "");
}

function newestFirst<T extends { provenance: Provenance[] }>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => {
    const la = latestObservation(a.provenance);
    const lb = latestObservation(b.provenance);
    return la === lb ? 0 : la < lb ? 1 : -1;
  });
}

function mergeAttributes(
  entityId: string,
  ordered: readonly Attributes[],
  conflicts: MergeConflict[],
): Attributes {
  const result: Attributes = {};
  const discarded = new Map<string, string[]>();
  for (const attrs of ordered) {
    for (const [key, value] of Object.entries(attrs)) {
      if (!(key in result)) {
        result[key] = value;
        continue;
      }
      const kept = JSON.stringify(result[key]);
      const other = JSON.stringify(value);
      if (kept !== other) discarded.set(key, [...(discarded.get(key) ?? []), other]);
    }
  }
  for (const [key, values] of [...discarded].sort(([a], [b]) => a.localeCompare(b))) {
    conflicts.push({
      entityId,
      field: `attributes.${key}`,
      keptValue: JSON.stringify(result[key]),
      discardedValues: values,
      resolution: "kept value from the most recently observed record",
    });
  }
  return result;
}

function scalarConflict<T>(
  entityId: string,
  field: string,
  values: readonly T[],
  conflicts: MergeConflict[],
): void {
  const distinct = [...new Set(values.map((v) => JSON.stringify(v)))];
  if (distinct.length <= 1) return;
  conflicts.push({
    entityId,
    field,
    keptValue: distinct[0] ?? "",
    discardedValues: distinct.slice(1),
    resolution: "kept value from the most recently observed record",
  });
}

/** Precondition: all records share an ID and a type (checked by the caller). */
export function mergeNodes(records: readonly GraphNode[], conflicts: MergeConflict[]): GraphNode {
  const ordered = newestFirst(records);
  const [newest] = ordered;
  if (newest === undefined) throw new Error("mergeNodes requires at least one record");
  if (ordered.length === 1) return newest;
  scalarConflict(
    newest.id,
    "label",
    ordered.map((n) => n.label),
    conflicts,
  );
  scalarConflict(
    newest.id,
    "trustBoundaryId",
    ordered.map((n) => n.trustBoundaryId ?? null),
    conflicts,
  );
  return {
    ...newest,
    attributes: mergeAttributes(
      newest.id,
      ordered.map((n) => n.attributes),
      conflicts,
    ),
    provenance: mergeProvenance(ordered.map((n) => n.provenance)),
  };
}

function mergeConditions(
  entityId: string,
  ordered: readonly GraphEdge[],
  conflicts: MergeConflict[],
): Condition[] {
  const byDescription = new Map<string, Condition>();
  for (const edge of ordered) {
    for (const condition of edge.conditions) {
      const existing = byDescription.get(condition.description);
      if (existing === undefined) {
        byDescription.set(condition.description, condition);
      } else if (existing.state !== condition.state) {
        conflicts.push({
          entityId,
          field: `conditions[${condition.description}]`,
          keptValue: existing.state,
          discardedValues: [condition.state],
          resolution: "kept state from the most recently observed record",
        });
      }
    }
  }
  return [...byDescription.values()];
}

/** Precondition: all records share (from, type, to). */
export function mergeEdges(records: readonly GraphEdge[], conflicts: MergeConflict[]): GraphEdge {
  const ordered = newestFirst(records);
  const [newest] = ordered;
  if (newest === undefined) throw new Error("mergeEdges requires at least one record");
  if (ordered.length === 1) return newest;
  const canonicalId = ordered.map((e) => e.id).sort()[0] ?? newest.id;
  scalarConflict(
    canonicalId,
    "lifecycle",
    ordered.map((e) => e.lifecycle),
    conflicts,
  );
  scalarConflict(
    canonicalId,
    "requiresAction",
    ordered.map((e) => e.requiresAction ?? null),
    conflicts,
  );
  const scopes = [...new Set(ordered.flatMap((e) => e.scopes ?? []))].sort();
  const inferred = ordered.find((e) => e.inferenceRule !== undefined)?.inferenceRule;
  return {
    ...newest,
    id: canonicalId,
    assertion: ordered.map((e) => e.assertion).reduce(strongerAssertion),
    confidence: ordered.map((e) => e.confidence).reduce(higherConfidence),
    ...(scopes.length > 0 ? { scopes } : {}),
    ...(inferred !== undefined ? { inferenceRule: inferred } : {}),
    conditions: mergeConditions(canonicalId, ordered, conflicts),
    attributes: mergeAttributes(
      canonicalId,
      ordered.map((e) => e.attributes),
      conflicts,
    ),
    provenance: mergeProvenance(ordered.map((e) => e.provenance)),
  };
}
