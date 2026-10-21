import { describe, expect, it } from "vitest";
import { DEMO_WORKSTATION_SNAPSHOT } from "../fixtures/demoWorkstation.ts";
import { e, graphOf, n, T0 } from "../../tests/helpers/graphBuilder.ts";
import { ingestSnapshot, type GraphIndex } from "../graph/index.ts";
import { analyzeBlastRadius, DEFAULT_ANALYSIS_SETTINGS } from "./index.ts";

const AS_OF = DEMO_WORKSTATION_SNAPSHOT.collectedAt;

function fixtureGraph(): GraphIndex {
  const result = ingestSnapshot(DEMO_WORKSTATION_SNAPSHOT);
  if (!result.ok) throw new Error("fixture failed to ingest");
  return result.graph;
}

describe("blast radius on the demo fixture", () => {
  const graph = fixtureGraph();
  const result = analyzeBlastRadius(
    graph,
    "agent:claude-desktop",
    DEFAULT_ANALYSIS_SETTINGS,
    AS_OF,
  );
  const impact = (id: string) => result.impacts.find((i) => i.resourceId === id);

  it("states the compromise assumption and the reachability disclaimer", () => {
    expect(result.assumption).toMatch(/fully controlled/);
    expect(result.disclaimer).toMatch(/not confirmed exploitability/);
  });

  it("reaches the payments repository through the shared PAT, with an inferred path", () => {
    const write = impact("res:repo-payments")?.actions.find((a) => a.action === "write");
    expect(write?.path.steps.map((s) => s.toId)).toEqual([
      "mcp:github",
      "cred:github-pat",
      "perm:gh-classic-repo",
      "res:repo-payments",
    ]);
    expect(write?.path.assertion).toBe("inferred");
    expect(write?.crossings).toEqual([
      expect.objectContaining({ fromBoundaryId: "tb:workstation", toBoundaryId: "tb:github" }),
    ]);
  });

  it("reaches production AWS only through the write-gated, conditional, stale workflow edge", () => {
    const del = impact("res:s3-prod-artifacts")?.actions.find((a) => a.action === "delete");
    expect(del?.path.steps.map((s) => s.edgeType)).toContain("ASSUMES_ROLE");
    expect(del?.path.conditionalEdgeIds.length).toBeGreaterThan(0);
    expect(del?.path.staleEdgeIds.length).toBeGreaterThan(0);
  });

  it("does not treat the unknown Full Disk Access permission as access", () => {
    expect(impact("res:protected-user-data")).toBeUndefined();
    const app = analyzeBlastRadius(graph, "app:terminal", DEFAULT_ANALYSIS_SETTINGS, AS_OF);
    expect(app.uncertainty.excludedEdges).toContainEqual(
      expect.objectContaining({ reason: "unknown_excluded" }),
    );
  });

  it("raises exfiltration only as a hypothesis combining read access and an egress-capable node", () => {
    expect(result.exfiltration.map((x) => x.resourceId)).toContain("res:repo-payments");
    expect(new Set(result.exfiltration.map((x) => x.egressNodeId))).toEqual(
      new Set(["mcp:notes-sync"]),
    );
  });

  it("lists monitor-only and externally declared controls without letting them stop propagation", () => {
    const states = result.controls.map((c) => [
      c.policyId,
      c.enforcementState,
      c.limitsPropagation,
    ]);
    expect(states).toEqual(
      expect.arrayContaining([
        ["policy:example-monitor", "monitor_only", false],
        ["policy:gh-branch-protection", "external_declared", false],
      ]),
    );
  });

  it("suggests mitigations measured by simulation, and never applies them", () => {
    expect(result.mitigations.length).toBeGreaterThan(0);
    for (const m of result.mitigations) {
      expect(m.requiresHumanAction).toBe(true);
      expect(m.impactsRemoved).toBeGreaterThan(0);
    }
    expect(fixtureGraph().edges.size).toBe(graph.edges.size);
  });

  it("is deterministic for identical input and settings", () => {
    const again = analyzeBlastRadius(
      fixtureGraph(),
      "agent:claude-desktop",
      DEFAULT_ANALYSIS_SETTINGS,
      AS_OF,
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });
});

describe("blast radius controls", () => {
  it("stops propagation only at a verified, enforced deny control", () => {
    const build = (enforcementState: string) =>
      graphOf(
        [
          n("agent:a", "Agent"),
          n("mcp:s", "MCPServer"),
          n("res:r", "Resource"),
          n("policy:p", "Policy", { attributes: { enforcementState, controlEffect: "deny" } }),
        ],
        [
          e("agent:a", "CONNECTS_TO", "mcp:s"),
          e("mcp:s", "CAN_WRITE", "res:r"),
          e("mcp:s", "CONTROLLED_BY", "policy:p"),
        ],
      );
    const enforced = analyzeBlastRadius(
      build("enforced_verified"),
      "agent:a",
      DEFAULT_ANALYSIS_SETTINGS,
      T0,
    );
    expect(enforced.impacts).toEqual([]);
    expect(enforced.reached).toEqual([
      expect.objectContaining({ nodeId: "mcp:s", containedBy: "policy:p" }),
    ]);

    for (const state of ["monitor_only", "advisory", "external_declared", "not_enforceable"]) {
      const result = analyzeBlastRadius(build(state), "agent:a", DEFAULT_ANALYSIS_SETTINGS, T0);
      expect(result.impacts.map((i) => i.resourceId)).toEqual(["res:r"]);
    }
  });
});
