import { describe, expect, it } from "vitest";
import { DEMO_WORKSTATION_SNAPSHOT } from "../fixtures/demoWorkstation.ts";
import { SENTINEL, e, n, prov, snapshot } from "../../tests/helpers/graphBuilder.ts";
import { ingestSnapshot } from "./index.ts";

function errorsOf(raw: unknown) {
  const result = ingestSnapshot(raw);
  if (result.ok) throw new Error("expected ingestion to fail");
  return result.errors;
}

describe("hypothetical edges", () => {
  it("are rejected at ingestion because only simulations may produce them", () => {
    const errors = errorsOf(
      snapshot(
        [n("agent:a", "Agent"), n("mcp:b", "MCPServer")],
        [e("agent:a", "CONNECTS_TO", "mcp:b", { assertion: "hypothetical" })],
      ),
    );
    expect(errors.map((x) => x.code)).toContain("hypothetical_in_snapshot");
  });
});

describe("ingestSnapshot", () => {
  it("accepts the labeled demo fixture with stable IDs", () => {
    const result = ingestSnapshot(DEMO_WORKSTATION_SNAPSHOT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.graph.meta.dataOrigin).toBe("fixture");
    expect(result.graph.meta.fixtureNotice).toMatch(/Synthetic demo data/);
    expect(result.graph.nodes.size).toBe(DEMO_WORKSTATION_SNAPSHOT.nodes.length);
    expect(result.graph.edges.size).toBe(DEMO_WORKSTATION_SNAPSHOT.edges.length);
  });

  it("is idempotent: ingesting duplicated records yields the same graph", () => {
    const once = ingestSnapshot(DEMO_WORKSTATION_SNAPSHOT);
    const twice = ingestSnapshot({
      ...DEMO_WORKSTATION_SNAPSHOT,
      nodes: [...DEMO_WORKSTATION_SNAPSHOT.nodes, ...DEMO_WORKSTATION_SNAPSHOT.nodes],
      edges: [...DEMO_WORKSTATION_SNAPSHOT.edges, ...DEMO_WORKSTATION_SNAPSHOT.edges],
    });
    if (!once.ok || !twice.ok) throw new Error("ingestion failed");
    expect([...twice.graph.nodes.values()]).toEqual([...once.graph.nodes.values()]);
    expect([...twice.graph.edges.values()]).toEqual([...once.graph.edges.values()]);
    expect(twice.graph.conflicts).toEqual([]);
  });

  it("rejects unknown node and edge types with a path to the problem", () => {
    const raw = snapshot([n("a:1", "Agent")], []);
    const bad = { ...raw, nodes: [{ ...raw.nodes[0], type: "Wizard" }] };
    const errors = errorsOf(bad);
    expect(errors[0]).toMatchObject({ code: "schema", path: "/nodes/0/type" });
  });

  it("rejects secret material instead of storing it, and never echoes the value", () => {
    const token = SENTINEL.githubToken();
    const raw = snapshot([n("a:1", "Agent", { attributes: { note: token } })], []);
    const errors = errorsOf(raw);
    expect(errors).toEqual([
      expect.objectContaining({ code: "secret_material", path: "/nodes/0/attributes/note" }),
    ]);
    expect(JSON.stringify(errors)).not.toContain(token);
  });

  it("requires every edge to carry provenance", () => {
    const edge = { ...e("a:1", "CONNECTS_TO", "s:1"), provenance: [] };
    const errors = errorsOf(snapshot([n("a:1", "Agent"), n("s:1", "MCPServer")], [edge]));
    expect(errors[0]?.path).toBe("/edges/0/provenance");
  });

  it("requires inferred edges to name their inference rule", () => {
    const edge = e("a:1", "CONNECTS_TO", "s:1", { assertion: "inferred" });
    const errors = errorsOf(snapshot([n("a:1", "Agent"), n("s:1", "MCPServer")], [edge]));
    expect(errors[0]?.path).toBe("/edges/0/inferenceRule");
  });

  it("requires a user-visible notice on fixture data", () => {
    const raw = snapshot([], []);
    const { fixtureNotice: _omitted, ...withoutNotice } = raw;
    expect(errorsOf(withoutNotice)[0]?.path).toBe("/fixtureNotice");
  });

  it("rejects dangling edges", () => {
    const errors = errorsOf(snapshot([n("a:1", "Agent")], [e("a:1", "CONNECTS_TO", "s:missing")]));
    expect(errors[0]).toMatchObject({ code: "dangling_edge" });
  });

  it("rejects a node ID declared with two different types instead of merging by name", () => {
    const errors = errorsOf(snapshot([n("x:1", "Agent"), n("x:1", "MCPServer")], []));
    expect(errors[0]).toMatchObject({ code: "node_type_conflict" });
  });

  it("requires edges leaving a resource to declare the access they need", () => {
    const nodes = [n("res:1", "Resource"), n("cred:1", "CredentialReference")];
    const errors = errorsOf(snapshot(nodes, [e("res:1", "HOLDS_CREDENTIAL_REFERENCE", "cred:1")]));
    expect(errors[0]).toMatchObject({ code: "ungated_resource_edge" });
  });

  it("requires Policy nodes to declare a valid enforcement state", () => {
    const errors = errorsOf(snapshot([n("policy:1", "Policy")], []));
    expect(errors[0]).toMatchObject({ code: "invalid_control" });
  });

  it("merges corroborating sources, keeps all provenance, and records disagreements explicitly", () => {
    const older = n("s:1", "MCPServer", {
      label: "old name",
      provenance: prov("a", "2026-10-01T00:00:00Z"),
    });
    const newer = n("s:1", "MCPServer", {
      label: "new name",
      provenance: prov("b", "2026-10-02T00:00:00Z"),
    });
    const result = ingestSnapshot(snapshot([older, newer], []));
    if (!result.ok) throw new Error("ingestion failed");
    const merged = result.graph.nodes.get("s:1");
    expect(merged?.label).toBe("new name");
    expect(merged?.provenance.map((p) => p.connectorId)).toEqual(["b", "a"]);
    expect(result.graph.conflicts).toEqual([
      expect.objectContaining({ entityId: "s:1", field: "label", keptValue: '"new name"' }),
    ]);
  });

  it("merges duplicate relationships under the smallest ID and keeps the strongest evidence", () => {
    const nodes = [n("a:1", "Agent"), n("s:1", "MCPServer")];
    const inferred = e("a:1", "CONNECTS_TO", "s:1", {
      id: "edge:z",
      assertion: "inferred",
      inferenceRule: "rule",
      confidence: "low",
      provenance: prov("a"),
    });
    const observed = e("a:1", "CONNECTS_TO", "s:1", { id: "edge:a", provenance: prov("b") });
    const result = ingestSnapshot(snapshot(nodes, [inferred, observed]));
    if (!result.ok) throw new Error("ingestion failed");
    const edge = result.graph.edges.get("edge:a");
    expect(edge).toMatchObject({ assertion: "observed", confidence: "high" });
    expect(edge?.provenance).toHaveLength(2);
    expect(result.graph.edgeAliases.get("edge:z")).toBe("edge:a");
  });
});
