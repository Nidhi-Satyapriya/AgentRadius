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

export const CATALOG_APPS: readonly CatalogApp[] = [
  { id: "github", label: "GitHub", provider: "github", providerLabel: "GitHub" },
  { id: "notion", label: "Notion", provider: "notion", providerLabel: "Notion" },
];

export const AGENT_RUNTIMES = ["in_app", "own_infrastructure", "device", "unknown"] as const;
export type AgentRuntime = (typeof AGENT_RUNTIMES)[number];

export const RUNTIME_LABELS: Readonly<Record<AgentRuntime, string>> = {
  in_app: "Inside the app",
  own_infrastructure: "Our servers or cloud",
  device: "A laptop or phone",
  unknown: "Not sure",
};

/**
 * `as_you`: in-app assistants act with the signed-in user's permissions, so by default the agent is
 * assumed to reach whatever you can in each app. `read` and `read_write` are the user's own limits.
 */
export const DECLARED_ACCESS = ["as_you", "read", "read_write"] as const;
export type DeclaredAccess = (typeof DECLARED_ACCESS)[number];

export const ACCESS_LABELS: Readonly<Record<DeclaredAccess, string>> = {
  as_you: "Whatever you can access (assumed)",
  read: "Read only",
  read_write: "Read and write",
};

export interface AgentPreset {
  readonly id: string;
  readonly label: string;
  readonly runtime: AgentRuntime;
  readonly appIds: readonly string[];
}

export const AGENT_PRESETS: readonly AgentPreset[] = [
  { id: "github-copilot", label: "GitHub Copilot", runtime: "in_app", appIds: ["github"] },
  { id: "notion-ai", label: "Notion AI", runtime: "in_app", appIds: ["notion"] },
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
