import { describe, expect, it } from "vitest";
import { CATALOG_APPS } from "../domain/index.ts";
import { ingestSnapshot } from "../graph/index.ts";
import { DEMO_WORKSTATION_SNAPSHOT } from "../fixtures/demoWorkstation.ts";
import { declaredAgentsToGraph } from "./declaredAgents.ts";
import { KNOWN_SERVICES } from "./mcpConfig/knownServices.ts";

const AGENT = {
  id: "agent:declared.github-copilot",
  name: "GitHub Copilot",
  runtime: "in_app",
  appIds: ["github", "notion"],
  access: "as_you",
  declaredAt: "2026-10-23T10:00:00.000Z",
} as const;

describe("declared agents", () => {
  it("shares provider boundaries with MCP service matching, with the same labels", () => {
    for (const app of CATALOG_APPS) {
      const known = KNOWN_SERVICES.find((s) => s.id === app.provider);
      if (known) expect(app.providerLabel).toBe(known.label);
    }
  });

  it("assumes an in-app agent acts as you, labeled as inferred, with user provenance", () => {
    const { nodes, edges, run } = declaredAgentsToGraph([AGENT]);
    expect(run.readOnly).toBe(true);
    expect(edges.map((e) => [e.type, e.to, e.assertion, e.inferenceRule])).toEqual([
      ["CAN_READ", "res:app.github", "inferred", "in-app-ai-acts-as-user"],
      ["CAN_READ", "res:app.notion", "inferred", "in-app-ai-acts-as-user"],
      ["CAN_WRITE", "res:app.github", "inferred", "in-app-ai-acts-as-user"],
      ["CAN_WRITE", "res:app.notion", "inferred", "in-app-ai-acts-as-user"],
    ]);
    const limited = declaredAgentsToGraph([{ ...AGENT, access: "read" }]).edges;
    expect(limited.map((e) => [e.type, e.assertion])).toEqual([
      ["CAN_READ", "declared"],
      ["CAN_READ", "declared"],
    ]);
    for (const record of [...nodes, ...edges])
      expect(record.provenance.every((p) => p.collectionMethod === "user_import")).toBe(true);
    expect(nodes.find((n) => n.id === AGENT.id)?.trustBoundaryId).toBeUndefined();
  });

  it("merges into an existing snapshot without validation errors or conflicts", () => {
    const declared = declaredAgentsToGraph([AGENT]);
    const result = ingestSnapshot({
      ...DEMO_WORKSTATION_SNAPSHOT,
      nodes: [...DEMO_WORKSTATION_SNAPSHOT.nodes, ...declared.nodes],
      edges: [...DEMO_WORKSTATION_SNAPSHOT.edges, ...declared.edges],
      connectorRuns: [...DEMO_WORKSTATION_SNAPSHOT.connectorRuns, declared.run],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.graph.conflicts).toEqual([]);
  });
});
