import { describe, expect, it } from "vitest";
import { DEMO_WORKSTATION_SNAPSHOT } from "../fixtures/demoWorkstation.ts";
import { ingestSnapshot, type GraphIndex } from "../graph/index.ts";
import { analyzeBlastRadius, DEFAULT_ANALYSIS_SETTINGS, reachMatrix } from "./index.ts";

const AS_OF = DEMO_WORKSTATION_SNAPSHOT.collectedAt;

function fixtureGraph(): GraphIndex {
  const result = ingestSnapshot(DEMO_WORKSTATION_SNAPSHOT);
  if (!result.ok) throw new Error("fixture failed to ingest");
  return result.graph;
}

describe("reach matrix", () => {
  const graph = fixtureGraph();
  const matrix = reachMatrix(graph, DEFAULT_ANALYSIS_SETTINGS, AS_OF);

  it("summarizes exactly the resources each agent's blast radius reaches", () => {
    for (const agentId of matrix.agentIds) {
      const report = analyzeBlastRadius(graph, agentId, DEFAULT_ANALYSIS_SETTINGS, AS_OF);
      const expected = report.reached
        .filter((r) => r.nodeType === "Resource")
        .map((r) => r.nodeId)
        .sort();
      const actual = matrix.cells
        .filter((c) => c.agentId === agentId)
        .map((c) => c.resourceId)
        .sort();
      expect(actual).toEqual(expected);
    }
  });

  it("carries the actions and evidence of the path, and never lists non-resources", () => {
    const payments = matrix.cells.find(
      (c) => c.agentId === "agent:claude-desktop" && c.resourceId.includes("payments"),
    );
    expect(payments?.actions.length).toBeGreaterThan(0);
    expect(payments?.assertion).toBe("inferred");
    const ids = new Set(matrix.resourceIds);
    for (const id of ids) expect(graph.nodes.get(id)?.type).toBe("Resource");
  });

  it("is deterministic and sorted by ID", () => {
    expect(reachMatrix(graph, DEFAULT_ANALYSIS_SETTINGS, AS_OF)).toEqual(matrix);
    expect([...matrix.agentIds]).toEqual([...matrix.agentIds].sort());
    expect([...matrix.resourceIds]).toEqual([...matrix.resourceIds].sort());
  });
});
