import { describe, expect, it } from "vitest";
import { e, n } from "../../../tests/helpers/graphBuilder.ts";
import { layoutGraph } from "./layout.ts";

describe("layoutGraph", () => {
  const nodes = [
    n("agent:a", "Agent"),
    n("mcp:b", "MCPServer"),
    n("tool:c", "Tool"),
    n("res:d", "Resource"),
  ];
  const edges = [
    e("agent:a", "CONNECTS_TO", "mcp:b"),
    e("mcp:b", "EXPOSES_TOOL", "tool:c"),
    e("tool:c", "CAN_READ", "res:d"),
  ];

  it("places each hop one column further right", () => {
    const { positions } = layoutGraph(nodes, edges);
    const xs = ["agent:a", "mcp:b", "tool:c", "res:d"].map((id) => positions.get(id)?.x ?? -1);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(4);
  });

  it("is independent of input order", () => {
    const a = layoutGraph(nodes, edges);
    const b = layoutGraph(nodes.toReversed(), edges.toReversed());
    expect([...b.positions.entries()].sort()).toEqual([...a.positions.entries()].sort());
  });

  it("terminates on cycles and still positions every node", () => {
    const cyclic = [...edges, e("res:d", "TRUSTS", "agent:a")];
    const { positions } = layoutGraph(nodes, cyclic);
    expect(positions.size).toBe(nodes.length);
  });

  it("ignores edges whose endpoints are filtered out", () => {
    const { positions } = layoutGraph(nodes.slice(0, 2), edges);
    expect([...positions.keys()].sort()).toEqual(["agent:a", "mcp:b"]);
  });
});
