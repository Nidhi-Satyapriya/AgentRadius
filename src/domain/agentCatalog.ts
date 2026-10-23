/**
 * Apps a user can say an agent reaches, and presets for AI assistants built into apps. Presets
 * only prefill the declaration form; the user confirms what the agent can reach.
 */

export interface CatalogApp {
  readonly id: string;
  readonly label: string;
  /** Provider trust boundary: `tb:saas.<provider>`. Shared with MCP service matching. */
  readonly provider: string;
  readonly providerLabel: string;
}

const ATLASSIAN = { provider: "atlassian", providerLabel: "Atlassian (Jira / Confluence)" };
const GOOGLE = {
  provider: "google-workspace",
  providerLabel: "Google Workspace (Drive / Gmail / Calendar)",
};
const MICROSOFT = { provider: "microsoft-365", providerLabel: "Microsoft 365" };
const own = (id: string, label: string): CatalogApp => ({
  id,
  label,
  provider: id,
  providerLabel: label,
});

export const CATALOG_APPS: readonly CatalogApp[] = [
  { id: "confluence", label: "Confluence", ...ATLASSIAN },
  { id: "jira", label: "Jira", ...ATLASSIAN },
  { id: "gmail", label: "Gmail", ...GOOGLE },
  { id: "google-calendar", label: "Google Calendar", ...GOOGLE },
  { id: "google-drive", label: "Google Drive", ...GOOGLE },
  { id: "outlook", label: "Outlook", ...MICROSOFT },
  { id: "teams", label: "Microsoft Teams", ...MICROSOFT },
  { id: "sharepoint", label: "SharePoint and OneDrive", ...MICROSOFT },
  own("slack", "Slack"),
  own("notion", "Notion"),
  own("github", "GitHub"),
  own("gitlab", "GitLab"),
  own("linear", "Linear"),
  own("figma", "Figma"),
  own("salesforce", "Salesforce"),
  own("hubspot", "HubSpot"),
  own("zendesk", "Zendesk"),
  own("zoom", "Zoom"),
  own("stripe", "Stripe"),
  own("aws", "AWS"),
];

export const AGENT_RUNTIMES = ["in_app", "own_infrastructure", "device", "unknown"] as const;
export type AgentRuntime = (typeof AGENT_RUNTIMES)[number];

export const RUNTIME_LABELS: Readonly<Record<AgentRuntime, string>> = {
  in_app: "Inside the app",
  own_infrastructure: "Our servers or cloud",
  device: "A laptop or phone",
  unknown: "Not sure",
};

export const DECLARED_ACCESS = ["read", "read_write", "unknown"] as const;
export type DeclaredAccess = (typeof DECLARED_ACCESS)[number];

export const ACCESS_LABELS: Readonly<Record<DeclaredAccess, string>> = {
  read: "Read",
  read_write: "Read and write",
  unknown: "Not sure",
};

export interface AgentPreset {
  readonly id: string;
  readonly label: string;
  readonly runtime: AgentRuntime;
  readonly appIds: readonly string[];
}

export const AGENT_PRESETS: readonly AgentPreset[] = [
  {
    id: "atlassian-rovo",
    label: "Atlassian Rovo",
    runtime: "in_app",
    appIds: ["confluence", "jira"],
  },
  {
    id: "gemini-workspace",
    label: "Gemini in Google Workspace",
    runtime: "in_app",
    appIds: ["gmail", "google-calendar", "google-drive"],
  },
  {
    id: "microsoft-copilot",
    label: "Microsoft 365 Copilot",
    runtime: "in_app",
    appIds: ["outlook", "teams", "sharepoint"],
  },
  { id: "notion-ai", label: "Notion AI", runtime: "in_app", appIds: ["notion"] },
  { id: "slack-ai", label: "Slack AI", runtime: "in_app", appIds: ["slack"] },
  { id: "github-copilot", label: "GitHub Copilot", runtime: "in_app", appIds: ["github"] },
  {
    id: "salesforce-agentforce",
    label: "Salesforce Agentforce",
    runtime: "in_app",
    appIds: ["salesforce"],
  },
  { id: "zoom-ai-companion", label: "Zoom AI Companion", runtime: "in_app", appIds: ["zoom"] },
];

/** A user-declared agent as held in the session. `id` is derived from the name. */
export interface DeclaredAgent {
  readonly id: string;
  readonly name: string;
  readonly runtime: AgentRuntime;
  readonly appIds: readonly string[];
  readonly access: DeclaredAccess;
  readonly declaredAt: string;
}

export const MAX_DECLARED_AGENTS = 50;

/** Connector run that carries user-declared agents. */
export const DECLARED_CONNECTOR_ID = "user.declared-agents";

export function catalogApp(id: string): CatalogApp | undefined {
  return CATALOG_APPS.find((a) => a.id === id);
}
