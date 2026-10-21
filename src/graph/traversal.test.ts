import { describe, expect, it } from "vitest";
import { T0, e, graphOf, n, prov } from "../../tests/helpers/graphBuilder.ts";
import { traverse, type TraversalOptions } from "./index.ts";

const OPTIONS: TraversalOptions = {
  asOf: T0,
  stalenessThresholdHours: 72,
  maxDepth: 10,
  maxReached: 1000,
  includeInferred: true,
  includeUnknown: false,
  includeHypothetical: false,
  containedNodes: new Map(),
};

const reachedIds = (r: ReturnType<typeof traverse>) => r.reached.map((x) => x.nodeId);

describe("traverse", () => {
  const chain = () =>
    graphOf(
      [
        n("agent:a", "Agent"),
        n("mcp:s", "MCPServer"),
        n("cred:c", "CredentialReference"),
        n("perm:p", "Permission"),
        n("res:r", "Resource"),
      ],
      [
        e("agent:a", "CONNECTS_TO", "mcp:s"),
        e("mcp:s", "AUTHENTICATES_WITH", "cred:c"),
        e("cred:c", "GRANTS_SCOPE", "perm:p"),
        e("perm:p", "CAN_WRITE", "res:r"),
      ],
    );

  it("follows a multi-hop path and explains every step", () => {
    const result = traverse(chain(), "agent:a", OPTIONS);
    expect(reachedIds(result)).toEqual(["mcp:s", "cred:c", "perm:p", "res:r"]);
    expect(result.access).toEqual([expect.objectContaining({ nodeId: "res:r", action: "write" })]);
    expect(result.access[0]?.path.steps.map((s) => s.toId)).toEqual([
      "mcp:s",
      "cred:c",
      "perm:p",
      "res:r",
    ]);
  });

  it("terminates on cycles", () => {
    const g = graphOf(
      [n("agent:a", "Agent"), n("agent:b", "Agent")],
      [e("agent:a", "DELEGATES_TO", "agent:b"), e("agent:b", "DELEGATES_TO", "agent:a")],
    );
    expect(reachedIds(traverse(g, "agent:a", OPTIONS))).toEqual(["agent:b"]);
  });

  it("excludes revoked edges and edges whose condition is known not to hold", () => {
    const g = graphOf(
      [n("agent:a", "Agent"), n("mcp:x", "MCPServer"), n("mcp:y", "MCPServer")],
      [
        e("agent:a", "CONNECTS_TO", "mcp:x", { lifecycle: "revoked" }),
        e("agent:a", "CONNECTS_TO", "mcp:y", {
          conditions: [{ description: "c", state: "does_not_hold" }],
        }),
      ],
    );
    const result = traverse(g, "agent:a", OPTIONS);
    expect(result.reached).toEqual([]);
    expect(result.excluded.map((x) => x.reason).sort()).toEqual([
      "condition_does_not_hold",
      "revoked",
    ]);
  });

  it("labels unresolved conditions and stale evidence on the path instead of dropping them", () => {
    const g = graphOf(
      [n("agent:a", "Agent"), n("mcp:x", "MCPServer")],
      [
        e("agent:a", "CONNECTS_TO", "mcp:x", {
          conditions: [{ description: "c", state: "unresolved" }],
          provenance: prov("old", "2026-09-01T00:00:00Z"),
        }),
      ],
    );
    const path = traverse(g, "agent:a", OPTIONS).reached[0]?.path;
    expect(path?.conditionalEdgeIds).toHaveLength(1);
    expect(path?.staleEdgeIds).toHaveLength(1);
  });

  it("does not traverse unknown edges by default, but reports them", () => {
    const g = graphOf(
      [n("app:t", "Application"), n("perm:fda", "Permission"), n("res:x", "Resource")],
      [
        e("app:t", "GRANTS_SCOPE", "perm:fda", { assertion: "unknown" }),
        e("perm:fda", "CAN_READ", "res:x"),
      ],
    );
    const strict = traverse(g, "app:t", OPTIONS);
    expect(strict.reached).toEqual([]);
    expect(strict.excluded).toEqual([expect.objectContaining({ reason: "unknown_excluded" })]);
    const inclusive = traverse(g, "app:t", { ...OPTIONS, includeUnknown: true });
    expect(reachedIds(inclusive)).toEqual(["perm:fda", "res:x"]);
    expect(inclusive.reached[1]?.path.assertion).toBe("unknown");
  });

  it("can exclude inferred edges and marks inferred paths otherwise", () => {
    const g = graphOf(
      [n("agent:a", "Agent"), n("mcp:x", "MCPServer")],
      [e("agent:a", "CONNECTS_TO", "mcp:x", { assertion: "inferred", inferenceRule: "r" })],
    );
    expect(traverse(g, "agent:a", OPTIONS).reached[0]?.path.assertion).toBe("inferred");
    expect(traverse(g, "agent:a", { ...OPTIONS, includeInferred: false }).reached).toEqual([]);
  });

  it("propagates TRUSTS in reverse: compromising the trusted party affects the truster", () => {
    const g = graphOf(
      [n("agent:a", "Agent"), n("agent:b", "Agent")],
      [e("agent:a", "TRUSTS", "agent:b")],
    );
    expect(reachedIds(traverse(g, "agent:b", OPTIONS))).toEqual(["agent:a"]);
    expect(reachedIds(traverse(g, "agent:a", OPTIONS))).toEqual([]);
  });

  describe("action-gated edges", () => {
    const gated = (accessType: "CAN_READ" | "CAN_WRITE") =>
      graphOf(
        [n("tool:t", "Tool"), n("res:repo", "Resource"), n("role:deploy", "CloudRole")],
        [
          e("tool:t", accessType, "res:repo"),
          e("res:repo", "ASSUMES_ROLE", "role:deploy", { requiresAction: "write" }),
        ],
      );

    it("are not followed when only weaker access is held", () => {
      const result = traverse(gated("CAN_READ"), "tool:t", OPTIONS);
      expect(reachedIds(result)).toEqual(["res:repo"]);
      expect(result.excluded).toEqual([
        expect.objectContaining({ reason: "required_access_not_reached" }),
      ]);
    });

    it("are followed once the required access is held, using the path that obtained it", () => {
      const result = traverse(gated("CAN_WRITE"), "tool:t", OPTIONS);
      expect(reachedIds(result)).toEqual(["res:repo", "role:deploy"]);
      expect(result.reached[1]?.path.steps.map((s) => s.edgeType)).toEqual([
        "CAN_WRITE",
        "ASSUMES_ROLE",
      ]);
    });

    it("are unlocked when the required access is gained later through another route", () => {
      const g = graphOf(
        [
          n("agent:a", "Agent"),
          n("tool:r", "Tool"),
          n("tool:w", "Tool"),
          n("mcp:m", "MCPServer"),
          n("res:repo", "Resource"),
          n("role:deploy", "CloudRole"),
        ],
        [
          e("agent:a", "CONNECTS_TO", "tool:r"),
          e("tool:r", "CAN_READ", "res:repo"),
          e("agent:a", "CONNECTS_TO", "mcp:m"),
          e("mcp:m", "EXPOSES_TOOL", "tool:w"),
          e("tool:w", "CAN_WRITE", "res:repo"),
          e("res:repo", "ASSUMES_ROLE", "role:deploy", { requiresAction: "write" }),
        ],
      );
      const result = traverse(g, "agent:a", OPTIONS);
      expect(reachedIds(result)).toContain("role:deploy");
      expect(result.excluded).toEqual([]);
    });
  });

  it("enforces the depth limit and reports truncation", () => {
    const result = traverse(chain(), "agent:a", { ...OPTIONS, maxDepth: 2 });
    expect(reachedIds(result)).toEqual(["mcp:s", "cred:c"]);
    expect(result.truncated).toBe("depth_limit");
  });

  it("enforces the result limit", () => {
    const result = traverse(chain(), "agent:a", { ...OPTIONS, maxReached: 1 });
    expect(result.reached).toHaveLength(1);
    expect(result.truncated).toBe("node_limit");
  });

  it("reaches but does not expand contained nodes", () => {
    const result = traverse(chain(), "agent:a", {
      ...OPTIONS,
      containedNodes: new Map([["mcp:s", "policy:p"]]),
    });
    expect(result.reached).toEqual([
      expect.objectContaining({ nodeId: "mcp:s", containedBy: "policy:p" }),
    ]);
  });

  it("is deterministic regardless of input order", () => {
    const g1 = chain();
    const reversed = graphOf([...g1.nodes.values()].reverse(), [...g1.edges.values()].reverse());
    expect(traverse(reversed, "agent:a", OPTIONS)).toEqual(traverse(g1, "agent:a", OPTIONS));
  });

  it("rejects unknown start nodes", () => {
    expect(() => traverse(chain(), "agent:nope", OPTIONS)).toThrow(/Unknown start node/);
  });
});
