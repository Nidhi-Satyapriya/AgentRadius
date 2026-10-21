import { describe, expect, it } from "vitest";
import { DEMO_WORKSTATION_SNAPSHOT } from "../fixtures/demoWorkstation.ts";
import { ingestSnapshot } from "../graph/index.ts";
import { DEFAULT_ANALYSIS_SETTINGS, simulateChanges } from "./index.ts";

const AS_OF = DEMO_WORKSTATION_SNAPSHOT.collectedAt;
const graph = (() => {
  const r = ingestSnapshot(DEMO_WORKSTATION_SNAPSHOT);
  if (!r.ok) throw new Error("fixture failed");
  return r.graph;
})();
const PAT_SCOPE = "edge:cred:github-pat>grants_scope>perm:gh-classic-repo";

describe("simulateChanges", () => {
  it("shows which impacts disappear when a permission is removed", () => {
    const result = simulateChanges(
      graph,
      "agent:claude-desktop",
      [{ kind: "remove_edge", edgeId: PAT_SCOPE }],
      DEFAULT_ANALYSIS_SETTINGS,
      AS_OF,
    );
    expect(result.impactsRemoved).toEqual(
      expect.arrayContaining([
        { resourceId: "res:repo-payments", action: "write" },
        { resourceId: "res:s3-prod-artifacts", action: "delete" },
      ]),
    );
    expect(result.impactsRemaining).toContainEqual({
      resourceId: "res:projects-dir",
      action: "write",
    });
    expect(result.impactsAdded).toEqual([]);
    expect(result.notice).toMatch(/Nothing was changed/);
  });

  it("never mutates the source graph", () => {
    const before = JSON.stringify([...graph.edges.entries()]);
    simulateChanges(
      graph,
      "agent:claude-desktop",
      [
        { kind: "remove_edge", edgeId: PAT_SCOPE },
        { kind: "add_enforced_deny", nodeId: "mcp:github" },
      ],
      DEFAULT_ANALYSIS_SETTINGS,
      AS_OF,
    );
    expect(JSON.stringify([...graph.edges.entries()])).toBe(before);
  });

  it("models a hypothetical enforced deny as containment", () => {
    const result = simulateChanges(
      graph,
      "agent:cursor",
      [{ kind: "add_enforced_deny", nodeId: "mcp:github" }],
      DEFAULT_ANALYSIS_SETTINGS,
      AS_OF,
    );
    expect(result.after.reached.find((r) => r.nodeId === "mcp:github")?.containedBy).toBe(
      "policy:simulated-deny:mcp:github",
    );
    expect(result.impactsRemaining).toEqual([{ resourceId: "res:s3-dev-logs", action: "read" }]);
  });

  it("shows what a newly granted relationship would expose", () => {
    const result = simulateChanges(
      graph,
      "agent:claude-desktop",
      [{ kind: "add_edge", from: "agent:claude-desktop", type: "CONNECTS_TO", to: "mcp:aws" }],
      DEFAULT_ANALYSIS_SETTINGS,
      AS_OF,
    );
    expect(result.outcomes[0]?.applied).toBe(true);
    expect(result.reachabilityAdded).toContain("mcp:aws");
    expect(result.impactsAdded.length).toBeGreaterThan(0);
    expect(result.impactsRemoved).toEqual([]);
    const added = result.after.reached.find((r) => r.nodeId === "mcp:aws");
    expect(added?.path.assertion).toBe("hypothetical");
  });

  it("applies the same structural rules to simulated edges as to imported ones", () => {
    const result = simulateChanges(
      graph,
      "agent:cursor",
      [{ kind: "add_edge", from: "res:repo-infra", type: "ASSUMES_ROLE", to: "role:aws-deploy" }],
      DEFAULT_ANALYSIS_SETTINGS,
      AS_OF,
    );
    expect(result.outcomes[0]?.applied).toBe(false);
    expect(result.outcomes[0]?.reason).toMatch(/requiresAction/);
  });

  it("reports changes that could not be applied", () => {
    const result = simulateChanges(
      graph,
      "agent:cursor",
      [{ kind: "remove_edge", edgeId: "edge:nope" }],
      DEFAULT_ANALYSIS_SETTINGS,
      AS_OF,
    );
    expect(result.outcomes).toEqual([
      {
        change: { kind: "remove_edge", edgeId: "edge:nope" },
        applied: false,
        reason: "Unknown edge",
      },
    ]);
    expect(result.impactsRemoved).toEqual([]);
  });
});
