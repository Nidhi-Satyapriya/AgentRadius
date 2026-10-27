import {
  catalogApp,
  providerConnectorId,
  providerInfo,
  type Action,
  type Condition,
  type EdgeType,
  type GraphEdge,
  type GraphNode,
  type Provenance,
} from "../../domain/index.ts";
import type { ConnectorResult } from "../contract.ts";
import type { ProviderInventory } from "./inventory.ts";

const ACTION_EDGE: Readonly<Record<Action, EdgeType>> = {
  read: "CAN_READ",
  write: "CAN_WRITE",
  delete: "CAN_DELETE",
  execute: "CAN_EXECUTE",
  admin: "CAN_ADMIN",
};
export const ACCOUNT_CONTENTS_RULE = "connected-account-contents";

const MCP_TOKEN_MAY_BE_NARROWER: Condition = {
  description:
    "The MCP server uses its own token, which may reach less than your account. That token is not inspected.",
  state: "unresolved",
};

/**
 * Turns one provider read into graph records. Items hang off your account, and off any existing
 * "everything you can access" resource for the same app (from an added agent or an MCP server),
 * so agents that act as you reach concrete items instead of a placeholder.
 */
export function providerToGraph(
  inv: ProviderInventory,
  existingNodeIds: ReadonlySet<string>,
): ConnectorResult {
  const info = providerInfo(inv.provider);
  const app = catalogApp(info.appId)!;
  const connectorId = providerConnectorId(inv.provider);
  const provenance: Provenance[] = [
    {
      connectorId,
      evidenceRef: inv.evidenceRef,
      observedAt: inv.readAt,
      collectionMethod: "provider_api",
    },
  ];
  const tbId = `tb:saas.${app.provider}`;
  const accountId = `user:${inv.provider}.${inv.accountId}`;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  if (!existingNodeIds.has(tbId))
    nodes.push({
      id: tbId,
      type: "TrustBoundary",
      label: app.providerLabel,
      attributes: {},
      provenance,
    });
  nodes.push({
    id: accountId,
    type: "UserIdentity",
    label: `You on ${info.label} (${inv.accountLabel})`,
    description: `Your ${info.label} account, read with a token you provided. The token was not kept.`,
    trustBoundaryId: tbId,
    attributes: {},
    provenance,
  });

  const anchors = [
    { id: `res:app.${info.appId}`, conditions: [] as Condition[] },
    { id: `res:saas.${app.provider}`, conditions: [MCP_TOKEN_MAY_BE_NARROWER] },
  ].filter((a) => existingNodeIds.has(a.id));

  for (const item of inv.items) {
    const itemId = `res:${inv.provider}.${item.id}`;
    nodes.push({
      id: itemId,
      type: "Resource",
      label: item.label,
      trustBoundaryId: tbId,
      attributes:
        item.isPrivate !== undefined ? { visibility: item.isPrivate ? "private" : "public" } : {},
      provenance,
    });
    for (const action of item.actions) {
      const type = ACTION_EDGE[action];
      edges.push({
        id: `edge:${accountId}>${type.toLowerCase()}>${itemId}`,
        type,
        from: accountId,
        to: itemId,
        assertion: inv.evidence.assertion,
        ...(inv.evidence.inferenceRule !== undefined
          ? { inferenceRule: inv.evidence.inferenceRule }
          : {}),
        confidence: inv.evidence.confidence,
        lifecycle: "active",
        conditions: [],
        attributes: {},
        provenance,
      });
      for (const anchor of anchors) {
        edges.push({
          id: `edge:${anchor.id}>${type.toLowerCase()}>${itemId}`,
          type,
          from: anchor.id,
          to: itemId,
          assertion: "inferred",
          inferenceRule: ACCOUNT_CONTENTS_RULE,
          requiresAction: action === "admin" ? "write" : action,
          confidence: inv.evidence.confidence === "high" ? "medium" : "low",
          lifecycle: "active",
          conditions: anchor.conditions,
          attributes: {},
          provenance,
        });
      }
    }
  }

  const [one, many] = info.items;
  const count = `${inv.items.length} ${inv.items.length === 1 ? one : many}`;
  return {
    run: {
      connectorId,
      label: `${info.label} account`,
      version: "1",
      status: inv.truncated ? "partial" : "completed",
      readOnly: true,
      startedAt: inv.readAt,
      finishedAt: inv.readAt,
      dataCategories: [`${info.label} ${many} visible to the token, with your access to each`],
      requiredPrivileges: [`A read-only ${info.tokenName} you created. Used once, not kept.`],
      coverage: `${count} visible to ${inv.accountLabel}.`,
      blindSpots: [
        info.limits,
        ...(inv.truncated ? [`Only the first ${inv.items.length} ${many} were read.`] : []),
      ],
      errors: [],
    },
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
