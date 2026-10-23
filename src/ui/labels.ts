import type { Action, NodeType } from "../domain/core.ts";

/** Plain-language names for graph entity types. */
export const TYPE_LABELS: Readonly<Record<NodeType, string>> = {
  UserIdentity: "Identity",
  Application: "App",
  Process: "Process",
  Agent: "AI agent",
  MCPServer: "MCP server",
  Tool: "Tool",
  OAuthGrant: "OAuth grant",
  CredentialReference: "Credential",
  CloudRole: "Cloud role",
  Resource: "Resource",
  Permission: "Permission",
  Policy: "Control",
  TrustBoundary: "Trust boundary",
};

/** What each graph type means, in one line. Shown in the legend. */
export const TYPE_MEANINGS: Readonly<Partial<Record<NodeType, string>>> = {
  UserIdentity: "Who is acting",
  Application: "App that hosts an agent",
  Agent: "Takes actions for a user",
  MCPServer: "Gives an agent tools",
  Tool: "A single tool an agent can call",
  CredentialReference: "Where a secret is kept (never its value)",
  OAuthGrant: "Access a user granted an app",
  Permission: "Access being granted",
  CloudRole: "Role that can be assumed",
  Resource: "Data or system being protected",
  Policy: "Rule recorded by another system",
};

export const ACTION_VERBS: Readonly<Record<Action, string>> = {
  read: "read",
  write: "change",
  delete: "delete",
  execute: "run",
  admin: "administer",
};

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
