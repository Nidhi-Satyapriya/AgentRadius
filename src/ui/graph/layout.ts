import type { GraphEdge, GraphNode } from "../../domain/index.ts";

export const NODE_WIDTH = 188;
export const NODE_HEIGHT = 46;
const COLUMN_GAP = 96;
const ROW_GAP = 22;
const MARGIN = 24;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface GraphLayout {
  readonly positions: ReadonlyMap<string, Point>;
  readonly width: number;
  readonly height: number;
}

/**
 * Deterministic layered layout: each node's column is its longest-path depth from a
 * source, following edges in their direction of travel. Policies sit to the right of
 * what they govern. Rows within a column are ordered by the mean row of predecessors,
 * then by id, so identical input always renders identically.
 */
export function layoutGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphLayout {
  const ids = nodes.map((n) => n.id).sort();
  const present = new Set(ids);
  const layoutEdges = edges
    .filter((e) => present.has(e.from) && present.has(e.to))
    .map((e) => (e.type === "TRUSTS" ? { from: e.to, to: e.from } : { from: e.from, to: e.to }))
    .sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));

  const column = new Map(ids.map((id) => [id, 0]));
  // Bounded relaxation: cycles stop growing after |V| passes instead of looping forever.
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const { from, to } of layoutEdges) {
      const next = (column.get(from) ?? 0) + 1;
      if (next > (column.get(to) ?? 0) && next < ids.length) {
        column.set(to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const predecessors = new Map<string, string[]>();
  for (const { from, to } of layoutEdges)
    predecessors.set(to, [...(predecessors.get(to) ?? []), from]);

  const columns = new Map<number, string[]>();
  for (const id of ids) {
    const c = column.get(id) ?? 0;
    columns.set(c, [...(columns.get(c) ?? []), id]);
  }

  const row = new Map<string, number>();
  const positions = new Map<string, Point>();
  const sortedColumns = [...columns.keys()].sort((a, b) => a - b);
  let maxRows = 0;
  for (const [index, c] of sortedColumns.entries()) {
    const members = columns.get(c) ?? [];
    const weight = (id: string) => {
      const rows = (predecessors.get(id) ?? [])
        .map((p) => row.get(p))
        .filter((r) => r !== undefined);
      return rows.length === 0
        ? Number.POSITIVE_INFINITY
        : rows.reduce((s, r) => s + r, 0) / rows.length;
    };
    const weights = new Map(members.map((id) => [id, weight(id)]));
    members.sort((a, b) => {
      const wa = weights.get(a) ?? 0;
      const wb = weights.get(b) ?? 0;
      return wa !== wb ? (wa < wb ? -1 : 1) : a < b ? -1 : 1;
    });
    members.forEach((id, r) => {
      row.set(id, r);
      positions.set(id, {
        x: MARGIN + index * (NODE_WIDTH + COLUMN_GAP),
        y: MARGIN + r * (NODE_HEIGHT + ROW_GAP),
      });
    });
    maxRows = Math.max(maxRows, members.length);
  }

  return {
    positions,
    width: MARGIN * 2 + Math.max(1, sortedColumns.length) * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP,
    height: MARGIN * 2 + Math.max(1, maxRows) * (NODE_HEIGHT + ROW_GAP) - ROW_GAP,
  };
}
