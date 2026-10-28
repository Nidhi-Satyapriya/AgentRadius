import {
  catalogApp,
  DECLARED_CONNECTOR_ID,
  type DeclaredAgent,
  type EdgeType,
  type GraphEdge,
  type GraphNode,
  type Provenance,
} from "../domain/index.ts";
import type { ConnectorResult } from "./contract.ts";

const EVIDENCE = "Entered in MCPRadius by you";

const ACCESS_EDGES: Readonly<Record<DeclaredAgent["access"], readonly EdgeType[]>> = {
  as_you: ["CAN_READ", "CAN_WRITE"],
  read: ["CAN_READ"],
  read_write: ["CAN_READ", "CAN_WRITE"],
};
const ACTS_AS_USER_RULE = "in-app-ai-acts-as-user";

/**
 * Turns agents the user described into graph records. Nothing is contacted or verified. Limits the
 * user chose are `declared`; the default "acts as you" access is `inferred`. All have medium
 * confidence and `user_import` provenance.
 */
export function declaredAgentsToGraph(agents: readonly DeclaredAgent[]): ConnectorResult {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const provenance = (at: string): Provenance[] => [
    {
      connectorId: DECLARED_CONNECTOR_ID,
      evidenceRef: EVIDENCE,
      observedAt: at,
      collectionMethod: "user_import",
    },
  ];
  const add = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  for (const agent of agents) {
    const apps = agent.appIds.flatMap((id) => catalogApp(id) ?? []);
    const providers = [...new Set(apps.map((a) => a.provider))];
    const home =
      agent.runtime === "in_app" && providers.length === 1 ? `tb:saas.${providers[0]}` : undefined;
    for (const app of apps) {
      add({
        id: `tb:saas.${app.provider}`,
        type: "TrustBoundary",
        label: app.providerLabel,
        attributes: {},
        provenance: provenance(agent.declaredAt),
      });
    }
    add({
      id: agent.id,
      type: "Agent",
      label: agent.name,
      description:
        agent.access === "as_you"
          ? "Added by you. Assistants inside an app act with your permissions there, so it is assumed to reach whatever you can. Not verified."
          : "Added by you, with the access you chose. Not verified.",
      ...(home !== undefined ? { trustBoundaryId: home } : {}),
      attributes: { declaredBy: "user", runtime: agent.runtime },
      provenance: provenance(agent.declaredAt),
    });
    for (const app of apps) {
      const resId = `res:app.${app.id}`;
      add({
        id: resId,
        type: "Resource",
        label: `${app.label}: everything you can access`,
        trustBoundaryId: `tb:saas.${app.provider}`,
        attributes: {},
        provenance: provenance(agent.declaredAt),
      });
      for (const type of ACCESS_EDGES[agent.access]) {
        edges.push({
          id: `edge:${agent.id}>${type.toLowerCase()}>${resId}`,
          type,
          from: agent.id,
          to: resId,
          assertion: agent.access === "as_you" ? "inferred" : "declared",
          ...(agent.access === "as_you" ? { inferenceRule: ACTS_AS_USER_RULE } : {}),
          confidence: "medium",
          lifecycle: "active",
          conditions: [],
          attributes: {},
          provenance: provenance(agent.declaredAt),
        });
      }
    }
  }

  return {
    run: {
      connectorId: DECLARED_CONNECTOR_ID,
      label: "Added by you",
      version: "1",
      status: "completed",
      readOnly: true,
      dataCategories: ["Agent names, where they run, and the apps they reach, as you entered them"],
      requiredPrivileges: [],
      coverage: `${agents.length} agent(s) you added. Not verified against the apps.`,
      blindSpots: ["The permissions each app actually grants the agent are not checked."],
      errors: [],
    },
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
