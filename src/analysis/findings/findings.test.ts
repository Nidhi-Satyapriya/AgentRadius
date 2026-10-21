import { describe, expect, it } from "vitest";
import { FindingSchema } from "../../domain/index.ts";
import { DEMO_WORKSTATION_SNAPSHOT } from "../../fixtures/demoWorkstation.ts";
import { ingestSnapshot } from "../../graph/index.ts";
import { scanForSecrets } from "../../redaction/index.ts";
import { analyzeFindings, DEFAULT_ANALYSIS_SETTINGS } from "../index.ts";

const AS_OF = DEMO_WORKSTATION_SNAPSHOT.collectedAt;
const graph = (() => {
  const r = ingestSnapshot(DEMO_WORKSTATION_SNAPSHOT);
  if (!r.ok) throw new Error("fixture failed");
  return r.graph;
})();
const findings = analyzeFindings(graph, DEFAULT_ANALYSIS_SETTINGS, AS_OF);
const byRule = (ruleId: string) => findings.filter((f) => f.ruleId === ruleId);

describe("analyzeFindings on the demo fixture", () => {
  it("produces schema-valid findings with evidence, rationale, and remediation", () => {
    for (const finding of findings) {
      expect(FindingSchema.safeParse(finding).success).toBe(true);
      expect(finding.remediation.length).toBeGreaterThan(0);
    }
    expect(
      findings.filter((f) => f.pathEdgeIds.length > 0).every((f) => f.evidenceRefs.length > 0),
    ).toBe(true);
  });

  it("is deterministic and does not duplicate findings across runs", () => {
    const again = analyzeFindings(graph, DEFAULT_ANALYSIS_SETTINGS, AS_OF);
    expect(again).toEqual(findings);
    expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
  });

  it("keeps severity and confidence independent", () => {
    const stripe = byRule("broad-credential-scope").find((f) =>
      f.affectedEntityIds.includes("cred:stripe-env"),
    );
    expect(stripe).toMatchObject({ severity: "high", confidence: "low" });
  });

  it("flags unmediated modifying access per agent", () => {
    expect(byRule("agent-unmediated-modifying-access").map((f) => f.affectedEntityIds[0])).toEqual([
      "agent:claude-desktop",
      "agent:cursor",
    ]);
  });

  it("flags the PAT shared with a third-party server and the unpinned servers", () => {
    expect(byRule("shared-credential-reference")[0]?.affectedEntityIds).toEqual(
      expect.arrayContaining(["cred:github-pat", "mcp:github", "mcp:notes-sync"]),
    );
    expect(
      byRule("unpinned-registry-mcp-server")
        .map((f) => f.affectedEntityIds[0])
        .sort(),
    ).toEqual(["mcp:github", "mcp:notes-sync"]);
  });

  it("reports an unknown OS permission as unknown, not as a denial or a grant", () => {
    expect(byRule("unknown-os-privacy-permission")).toEqual([
      expect.objectContaining({ severity: "info", title: expect.stringMatching(/^Unknown:/) }),
    ]);
  });

  it("groups cross-boundary reach into one finding per agent", () => {
    expect(byRule("cross-boundary-reach")).toHaveLength(2);
  });

  it("contains no secret-shaped values", () => {
    expect(scanForSecrets(findings)).toEqual([]);
  });
});
