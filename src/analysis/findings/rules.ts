import {
  credentialStorageOf,
  lowerConfidence,
  packageSourceOf,
  permissionKindOf,
  scopeBreadthOf,
  versionPinnedOf,
  type Action,
  type Confidence,
  type Finding,
  type GraphEdge,
  type Severity,
} from "../../domain/index.ts";
import { incomingEdges, type GraphIndex } from "../../graph/index.ts";
import type { ActionImpact, ResourceImpact } from "../blastRadius.ts";
import { label, makeFinding, type FindingRule, type RuleContext } from "./ruleKit.ts";

const DESTRUCTIVE: ReadonlySet<Action> = new Set(["delete", "admin"]);
const MODIFYING: ReadonlySet<Action> = new Set(["write", "delete", "execute", "admin"]);
const REGISTRY_SOURCES: ReadonlySet<string> = new Set(["npm", "pypi", "docker"]);

function nodesOfType(graph: GraphIndex, type: string): string[] {
  return [...graph.nodes.values()]
    .filter((n) => n.type === type)
    .map((n) => n.id)
    .sort();
}

function weakestConfidence(edges: readonly GraphEdge[]): Confidence {
  return edges.map((e) => e.confidence).reduce(lowerConfidence, "high");
}

export const broadCredentialScope: FindingRule = {
  id: "broad-credential-scope",
  version: "1.0.0",
  description: "A credential or grant holds a permission classified as broad or administrative.",
  evaluate(context) {
    const findings: Finding[] = [];
    for (const edge of context.graph.edges.values()) {
      if (edge.type !== "GRANTS_SCOPE" || edge.lifecycle === "revoked") continue;
      const permission = context.graph.nodes.get(edge.to);
      const breadth = permission === undefined ? undefined : scopeBreadthOf(permission);
      if (breadth !== "broad" && breadth !== "admin") continue;
      if (edge.assertion === "unknown") continue;
      findings.push(
        makeFinding(this, context, {
          title: `${label(context, edge.from)} holds ${breadth} permission "${label(context, edge.to)}"`,
          severity: breadth === "admin" ? "high" : "medium",
          confidence: edge.confidence,
          affectedEntityIds: [edge.from, edge.to],
          pathEdgeIds: [edge.id],
          rationale: `The permission is classified as ${breadth} for its resource class. A declared scope is not proof of effective access, but it bounds what a holder of this credential could do.`,
          assumptions:
            edge.assertion === "declared"
              ? [
                  "Scope is declared by the provider or configuration; effective access depends on resource-level settings.",
                ]
              : [],
          remediation: [
            "Replace with a fine-grained credential limited to the resources and actions actually used.",
            "Set an expiry and record an owner for the credential.",
          ],
        }),
      );
    }
    return findings;
  },
};

function worstImpact(
  impacts: readonly ResourceImpact[],
): { impact: ResourceImpact; action: ActionImpact; severity: Severity } | undefined {
  let best: { impact: ResourceImpact; action: ActionImpact; severity: Severity } | undefined;
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  for (const impact of impacts) {
    for (const action of impact.actions) {
      if (!MODIFYING.has(action.action)) continue;
      const sensitive = impact.sensitivity === "high" || impact.sensitivity === "critical";
      const severity: Severity =
        DESTRUCTIVE.has(action.action) && sensitive
          ? "critical"
          : DESTRUCTIVE.has(action.action) || sensitive
            ? "high"
            : "medium";
      if (best === undefined || rank[severity] < rank[best.severity])
        best = { impact, action, severity };
    }
  }
  return best;
}

export const unmediatedModifyingAccess: FindingRule = {
  id: "agent-unmediated-modifying-access",
  version: "1.0.0",
  description:
    "An agent can reach write, delete, execute, or admin actions with no verified enforced control on the path.",
  evaluate(context) {
    const findings: Finding[] = [];
    for (const agentId of nodesOfType(context.graph, "Agent")) {
      const result = context.blastRadius(agentId);
      const modifying = result.impacts
        .map((i) => ({ ...i, actions: i.actions.filter((a) => MODIFYING.has(a.action)) }))
        .filter((i) => i.actions.length > 0);
      const worst = worstImpact(modifying);
      if (worst === undefined) continue;
      findings.push(
        makeFinding(this, context, {
          title: `${label(context, agentId)} has modifying access to ${modifying.length} resource(s) with no enforced control`,
          severity: worst.severity,
          confidence: worst.action.path.confidence,
          affectedEntityIds: [agentId, ...modifying.map((i) => i.resourceId)],
          pathEdgeIds: worst.action.path.steps.map((s) => s.edgeId),
          rationale: `Most severe path: ${label(context, agentId)} → ${label(context, worst.impact.resourceId)} (${worst.action.action}, sensitivity ${worst.impact.sensitivity}). No control on these paths is verified as enforced; monitoring and advisory controls do not stop requests.`,
          assumptions: [
            "Technical reachability only; exploitability depends on the agent being compromised or manipulated (e.g. prompt injection).",
          ],
          remediation: [
            "Require human approval for write and delete tools on this agent's MCP servers.",
            "Reduce the credentials behind those servers to the minimum required scope.",
          ],
          relatedControlIds: result.controls.map((c) => c.policyId),
        }),
      );
    }
    return findings;
  },
};

export const crossBoundaryReach: FindingRule = {
  id: "cross-boundary-reach",
  version: "1.0.0",
  description: "An agent's reachable set crosses into a different trust boundary.",
  evaluate(context) {
    const findings: Finding[] = [];
    for (const agentId of nodesOfType(context.graph, "Agent")) {
      const result = context.blastRadius(agentId);
      const byDestination = new Map<string, string[]>();
      for (const entity of result.reached) {
        for (const crossing of entity.crossings) {
          if (byDestination.has(crossing.toBoundaryId)) continue;
          byDestination.set(
            crossing.toBoundaryId,
            entity.path.steps.map((s) => s.edgeId),
          );
        }
      }
      const home = context.graph.nodes.get(agentId)?.trustBoundaryId;
      const destinations = [...byDestination.keys()].filter((id) => id !== home).sort();
      if (destinations.length === 0) continue;
      const pathEdgeIds = [...new Set(destinations.flatMap((id) => byDestination.get(id) ?? []))];
      const pathEdges = pathEdgeIds.flatMap((id) => context.graph.edges.get(id) ?? []);
      findings.push(
        makeFinding(this, context, {
          title: `${label(context, agentId)} reaches into ${destinations.length} other trust boundar${destinations.length === 1 ? "y" : "ies"}`,
          severity: "medium",
          confidence: weakestConfidence(pathEdges),
          affectedEntityIds: [agentId, ...destinations],
          pathEdgeIds,
          rationale: `A compromise of ${label(context, agentId)} could propagate from ${label(context, home ?? "an unknown boundary")} into ${destinations.map((d) => label(context, d)).join(", ")}.`,
          remediation: [
            "Confirm each crossing is intended, then gate it with an approval policy or a narrower credential.",
          ],
        }),
      );
    }
    return findings;
  },
};

export const sharedCredential: FindingRule = {
  id: "shared-credential-reference",
  version: "1.0.0",
  description: "One credential reference is used by multiple servers, applications, or agents.",
  evaluate(context) {
    const findings: Finding[] = [];
    for (const credId of nodesOfType(context.graph, "CredentialReference")) {
      const users = incomingEdges(context.graph, credId).filter(
        (e) => e.type === "AUTHENTICATES_WITH" && e.lifecycle === "active",
      );
      const holders = [...new Set(users.map((e) => e.from))].sort();
      if (holders.length < 2) continue;
      findings.push(
        makeFinding(this, context, {
          title: `Credential "${label(context, credId)}" is shared by ${holders.length} consumers`,
          severity: "medium",
          confidence: weakestConfidence(users),
          affectedEntityIds: [credId, ...holders],
          pathEdgeIds: users.map((e) => e.id).sort(),
          rationale: `Compromise of any of ${holders.map((h) => label(context, h)).join(", ")} exposes the same credential, and revoking it would break all of them.`,
          remediation: ["Issue a separate, narrowly scoped credential per consumer."],
        }),
      );
    }
    return findings;
  },
};

export const unpinnedThirdPartyServer: FindingRule = {
  id: "unpinned-registry-mcp-server",
  version: "1.0.0",
  description: "An MCP server is launched from a public package registry without a pinned version.",
  evaluate(context) {
    const findings: Finding[] = [];
    for (const serverId of nodesOfType(context.graph, "MCPServer")) {
      const node = context.graph.nodes.get(serverId)!;
      const source = packageSourceOf(node);
      if (source === undefined || !REGISTRY_SOURCES.has(source) || versionPinnedOf(node) !== false)
        continue;
      findings.push(
        makeFinding(this, context, {
          title: `${node.label} runs an unpinned ${source} package`,
          severity: "medium",
          confidence: "high",
          affectedEntityIds: [serverId],
          pathEdgeIds: [],
          rationale:
            "Each launch may fetch a different upstream version, so tool code and tool descriptions can change without review.",
          remediation: [
            "Pin an exact, reviewed version (and ideally an integrity hash) in the client configuration.",
          ],
        }),
      );
    }
    return findings;
  },
};

function isUnverified(action: ActionImpact): boolean {
  const p = action.path;
  return p.assertion === "inferred" || p.staleEdgeIds.length > 0 || p.conditionalEdgeIds.length > 0;
}

export const unverifiedHighImpactPath: FindingRule = {
  id: "high-impact-path-unverified-evidence",
  version: "1.0.0",
  description: "A modifying-access path depends on inferred, stale, or conditional evidence.",
  evaluate(context) {
    const findings: Finding[] = [];
    for (const agentId of nodesOfType(context.graph, "Agent")) {
      const unverified = context
        .blastRadius(agentId)
        .impacts.flatMap((impact) =>
          impact.actions
            .filter((a) => MODIFYING.has(a.action) && isUnverified(a))
            .map((a) => ({ resourceId: impact.resourceId, path: a.path })),
        );
      if (unverified.length === 0) continue;
      const paths = unverified.map((u) => u.path);
      const edgeIds = [...new Set(paths.flatMap((p) => p.steps.map((s) => s.edgeId)))];
      const stale = new Set(paths.flatMap((p) => p.staleEdgeIds)).size;
      const conditional = new Set(paths.flatMap((p) => p.conditionalEdgeIds)).size;
      const reasons = [
        paths.some((p) => p.assertion === "inferred") ? "inferred relationships" : null,
        stale > 0 ? `${stale} stale observation(s)` : null,
        conditional > 0 ? `${conditional} relationship(s) with unresolved conditions` : null,
      ].filter((r): r is string => r !== null);
      const resources = [...new Set(unverified.map((u) => u.resourceId))].sort();
      findings.push(
        makeFinding(this, context, {
          title: `${label(context, agentId)}: ${resources.length} modifying-access path(s) rest on unverified evidence`,
          severity: "low",
          confidence: paths.map((p) => p.confidence).reduce(lowerConfidence, "high"),
          affectedEntityIds: [agentId, ...resources],
          pathEdgeIds: edgeIds,
          rationale: `These paths rely on ${reasons.join(", ")}. They may overstate or understate real access to ${resources.map((r) => label(context, r)).join(", ")}.`,
          remediation: [
            "Refresh the relevant connectors, resolve the listed conditions, or confirm the inferred relationships manually.",
          ],
        }),
      );
    }
    return findings;
  },
};

export const unknownOsPermission: FindingRule = {
  id: "unknown-os-privacy-permission",
  version: "1.0.0",
  description:
    "AgentRadius could not determine whether an application holds a macOS privacy permission.",
  evaluate(context) {
    const findings: Finding[] = [];
    for (const edge of context.graph.edges.values()) {
      if (edge.type !== "GRANTS_SCOPE" || edge.assertion !== "unknown") continue;
      const permission = context.graph.nodes.get(edge.to);
      if (permission === undefined || permissionKindOf(permission) !== "os_privacy") continue;
      findings.push(
        makeFinding(this, context, {
          title: `Unknown: does ${label(context, edge.from)} have ${permission.label}?`,
          severity: "info",
          confidence: "low",
          affectedEntityIds: [edge.from, edge.to],
          pathEdgeIds: [edge.id],
          rationale:
            "macOS does not expose this permission to AgentRadius without additional authorization. Unknown is not the same as denied.",
          remediation: [
            "Check System Settings → Privacy & Security, or provide an explicitly authorized report.",
          ],
        }),
      );
    }
    return findings;
  },
};

export const plaintextCredentialInConfig: FindingRule = {
  id: "plaintext-credential-in-config",
  version: "1.0.0",
  description: "A credential's value is written in plain text in a configuration file.",
  evaluate(context) {
    const findings: Finding[] = [];
    for (const credId of nodesOfType(context.graph, "CredentialReference")) {
      const cred = context.graph.nodes.get(credId)!;
      if (credentialStorageOf(cred) !== "plaintext_config") continue;
      const users = incomingEdges(context.graph, credId).filter(
        (e) => e.type === "AUTHENTICATES_WITH" && e.lifecycle === "active",
      );
      findings.push(
        makeFinding(this, context, {
          title: `${cred.label} is stored in plain text`,
          severity: "high",
          confidence: "high",
          affectedEntityIds: [credId, ...users.map((e) => e.from)],
          pathEdgeIds: users.map((e) => e.id).sort(),
          rationale:
            "Any process running as your user, any backup, and any tool that syncs or shares this file can read the credential. AgentRadius detected this from the configuration's structure and did not record the value.",
          remediation: [
            "Rotate the credential, since it may already have been copied.",
            "Move it to a secret manager reference (for example op://…) or the client's prompted input (for example ${input:…} in VS Code).",
          ],
        }),
      );
    }
    return findings;
  },
};

export const FINDING_RULES: readonly FindingRule[] = [
  plaintextCredentialInConfig,
  broadCredentialScope,
  unmediatedModifyingAccess,
  crossBoundaryReach,
  sharedCredential,
  unpinnedThirdPartyServer,
  unverifiedHighImpactPath,
  unknownOsPermission,
];

export function evaluateRules(
  context: RuleContext,
  rules: readonly FindingRule[] = FINDING_RULES,
): Finding[] {
  return rules.flatMap((rule) => rule.evaluate(context));
}
