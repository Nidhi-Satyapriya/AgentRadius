import type {
  Assertion,
  Attributes,
  Condition,
  Confidence,
  ConnectorRun,
  EdgeType,
  GraphEdge,
  GraphNode,
  NodeType,
  Snapshot,
  Action,
} from "../domain/index.ts";

/**
 * SYNTHETIC DEMO DATA. Every entity below is invented to exercise the analysis engine and UI.
 * None of it was collected from this or any other machine, and it contains no credential values.
 */

const COLLECTED_AT = "2026-10-20T09:00:00Z";
/** Older observation used to demonstrate stale evidence (beyond the 72h default threshold). */
const PREVIOUS_SCAN = "2026-09-28T09:00:00Z";

function provenance(connectorId: string, anchor: string, observedAt = COLLECTED_AT) {
  return [
    {
      connectorId,
      evidenceRef: `fixture:demo-workstation#${anchor}`,
      observedAt,
      collectionMethod: "fixture" as const,
    },
  ];
}

function node(
  id: string,
  type: NodeType,
  label: string,
  connectorId: string,
  options: {
    boundary?: string;
    description?: string;
    attributes?: Attributes;
    observedAt?: string;
  } = {},
): GraphNode {
  return {
    id,
    type,
    label,
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.boundary !== undefined ? { trustBoundaryId: options.boundary } : {}),
    attributes: options.attributes ?? {},
    provenance: provenance(connectorId, id, options.observedAt),
  };
}

interface EdgeOptions {
  assertion?: Assertion;
  confidence?: Confidence;
  inferenceRule?: string;
  requiresAction?: Action;
  scopes?: string[];
  conditions?: Condition[];
  observedAt?: string;
  attributes?: Attributes;
}

function edge(
  from: string,
  type: EdgeType,
  to: string,
  connectorId: string,
  options: EdgeOptions = {},
): GraphEdge {
  const id = `edge:${from}>${type.toLowerCase()}>${to}`;
  return {
    id,
    type,
    from,
    to,
    assertion: options.assertion ?? "declared",
    confidence: options.confidence ?? "high",
    lifecycle: "active",
    ...(options.inferenceRule !== undefined ? { inferenceRule: options.inferenceRule } : {}),
    ...(options.requiresAction !== undefined ? { requiresAction: options.requiresAction } : {}),
    ...(options.scopes !== undefined ? { scopes: options.scopes } : {}),
    conditions: options.conditions ?? [],
    attributes: options.attributes ?? {},
    provenance: provenance(connectorId, id, options.observedAt),
  };
}

const MCP = "fixture.mcp-config";
const APPS = "fixture.app-inventory";
const FILES = "fixture.dotenv-keynames";
const GITHUB = "fixture.github-token-metadata";
const AWS = "fixture.aws-iam";
const GOOGLE = "fixture.oauth-grants";
const TCC = "fixture.macos-privacy";

const WS = "tb:workstation";

const nodes: GraphNode[] = [
  node("tb:workstation", "TrustBoundary", "This Mac — user session", APPS),
  node("tb:github", "TrustBoundary", "GitHub org: example-org", GITHUB),
  node("tb:aws-prod", "TrustBoundary", "AWS account: production", AWS, {
    observedAt: PREVIOUS_SCAN,
  }),
  node("tb:aws-dev", "TrustBoundary", "AWS account: development", AWS),
  node("tb:google", "TrustBoundary", "Google Workspace: example.com", GOOGLE),
  node("tb:stripe", "TrustBoundary", "Stripe account (example)", FILES),

  node("user:dev", "UserIdentity", "macOS user “dev”", APPS, { boundary: WS }),
  node("app:claude-desktop", "Application", "Claude Desktop", APPS, {
    boundary: WS,
    attributes: { bundleId: "com.anthropic.claudefordesktop", codeSigned: true },
  }),
  node("app:cursor", "Application", "Cursor", APPS, {
    boundary: WS,
    attributes: { bundleId: "com.todesktop.230313mzl4w4u92", codeSigned: true },
  }),
  node("app:terminal", "Application", "Terminal", APPS, {
    boundary: WS,
    attributes: { bundleId: "com.apple.Terminal", codeSigned: true },
  }),

  node("agent:claude-desktop", "Agent", "Claude Desktop assistant", MCP, {
    boundary: WS,
    description: "LLM-driven agent. It reaches only what its MCP servers and connectors expose.",
  }),
  node("agent:cursor", "Agent", "Cursor agent", MCP, { boundary: WS }),

  node("mcp:filesystem", "MCPServer", "filesystem MCP server", MCP, {
    boundary: WS,
    attributes: {
      transport: "stdio",
      packageSource: "npm",
      package: "@modelcontextprotocol/server-filesystem",
      versionPinned: true,
      allowedDirectories: ["~/Projects"],
    },
  }),
  node("mcp:github", "MCPServer", "GitHub MCP server", MCP, {
    boundary: WS,
    attributes: { transport: "stdio", packageSource: "docker", versionPinned: false },
  }),
  node("mcp:notes-sync", "MCPServer", "notes-sync MCP server (community)", MCP, {
    boundary: WS,
    description: "Third-party server that syncs notes to a remote gist.",
    attributes: {
      transport: "stdio",
      packageSource: "npm",
      versionPinned: false,
      networkEgress: true,
    },
  }),
  node("mcp:aws", "MCPServer", "AWS API MCP server", MCP, {
    boundary: WS,
    attributes: { transport: "stdio", packageSource: "pypi", versionPinned: true },
  }),

  node("tool:fs.read_file", "Tool", "read_file", MCP, { boundary: WS }),
  node("tool:fs.write_file", "Tool", "write_file", MCP, { boundary: WS }),
  node("tool:gh.get_file_contents", "Tool", "get_file_contents", MCP, { boundary: WS }),
  node("tool:gh.create_or_update_file", "Tool", "create_or_update_file", MCP, { boundary: WS }),
  node("tool:notes.upload", "Tool", "upload_note", MCP, {
    boundary: WS,
    attributes: { networkEgress: true },
  }),
  node("tool:aws.call_aws", "Tool", "call_aws", MCP, { boundary: WS }),

  node("cred:github-pat", "CredentialReference", "GitHub classic PAT (1Password reference)", MCP, {
    boundary: WS,
    description:
      "Referenced as op://Private/GitHub-PAT/credential by two MCP server configs. Value never read.",
    attributes: {
      credentialKind: "github_classic_pat",
      valueCollected: false,
      expiry: "none recorded",
    },
  }),
  node("cred:aws-dev-sso", "CredentialReference", "AWS SSO profile “dev”", MCP, {
    boundary: WS,
    attributes: { credentialKind: "aws_sso_profile", valueCollected: false, shortLived: true },
  }),
  node(
    "cred:stripe-env",
    "CredentialReference",
    "STRIPE_SECRET_KEY in ~/Projects/shop/.env",
    FILES,
    {
      boundary: WS,
      description: "Only the key name was recorded; the value was discarded at parse time.",
      attributes: { credentialKind: "env_file_key", valueCollected: false },
    },
  ),
  node("oauth:claude-gdrive", "OAuthGrant", "Claude connector → Google Drive", GOOGLE, {
    boundary: "tb:google",
    attributes: { grantedTo: "Claude (connector)", grantedAt: "2026-06-02" },
  }),

  node("perm:gh-classic-repo", "Permission", "GitHub scopes repo, workflow", GITHUB, {
    boundary: "tb:github",
    attributes: { scopeBreadth: "broad", permissionKind: "token_scope" },
  }),
  node("perm:aws-dev-readonly", "Permission", "AWS ReadOnlyAccess (dev)", AWS, {
    boundary: "tb:aws-dev",
    attributes: { scopeBreadth: "narrow", permissionKind: "cloud_policy" },
  }),
  node("perm:stripe-secret", "Permission", "Stripe secret key: full API access", FILES, {
    boundary: "tb:stripe",
    attributes: { scopeBreadth: "admin", permissionKind: "token_scope" },
  }),
  node("perm:gdrive-readonly", "Permission", "Google scope drive.readonly", GOOGLE, {
    boundary: "tb:google",
    attributes: { scopeBreadth: "broad", permissionKind: "oauth_scope" },
  }),
  node("perm:tcc-full-disk-access", "Permission", "macOS Full Disk Access", TCC, {
    boundary: WS,
    attributes: { permissionKind: "os_privacy", tccService: "kTCCServiceSystemPolicyAllFiles" },
  }),

  node("role:aws-deploy", "CloudRole", "IAM role DeployRole (prod)", AWS, {
    boundary: "tb:aws-prod",
    observedAt: PREVIOUS_SCAN,
  }),

  node("res:projects-dir", "Resource", "~/Projects", FILES, {
    boundary: WS,
    attributes: { resourceKind: "directory", sensitivity: "moderate" },
  }),
  node(
    "res:protected-user-data",
    "Resource",
    "Protected user data (Mail, Messages, app containers)",
    TCC,
    {
      boundary: WS,
      attributes: { resourceKind: "os_protected_data", sensitivity: "high" },
    },
  ),
  node("res:repo-payments", "Resource", "example-org/payments-service", GITHUB, {
    boundary: "tb:github",
    attributes: { resourceKind: "repository", sensitivity: "critical", visibility: "private" },
  }),
  node("res:repo-infra", "Resource", "example-org/infra (deploy workflows)", GITHUB, {
    boundary: "tb:github",
    attributes: { resourceKind: "repository", sensitivity: "high", visibility: "private" },
  }),
  node("res:s3-prod-artifacts", "Resource", "S3 bucket prod-release-artifacts", AWS, {
    boundary: "tb:aws-prod",
    observedAt: PREVIOUS_SCAN,
    attributes: { resourceKind: "object_store", sensitivity: "high" },
  }),
  node("res:ecs-payments-prod", "Resource", "ECS service payments-api (prod)", AWS, {
    boundary: "tb:aws-prod",
    observedAt: PREVIOUS_SCAN,
    attributes: { resourceKind: "compute_service", sensitivity: "critical" },
  }),
  node("res:s3-dev-logs", "Resource", "S3 bucket dev-app-logs", AWS, {
    boundary: "tb:aws-dev",
    attributes: { resourceKind: "object_store", sensitivity: "low" },
  }),
  node("res:stripe-account", "Resource", "Stripe account data and payouts", FILES, {
    boundary: "tb:stripe",
    attributes: { resourceKind: "saas_account", sensitivity: "critical" },
  }),
  node("res:gdrive-files", "Resource", "All Google Drive files of dev@example.com", GOOGLE, {
    boundary: "tb:google",
    attributes: { resourceKind: "file_store", sensitivity: "high" },
  }),

  node("policy:gh-branch-protection", "Policy", "GitHub branch protection on infra/main", GITHUB, {
    boundary: "tb:github",
    description: "Reported by GitHub. Not verified or enforced by AgentRadius.",
    attributes: { enforcementState: "external_declared", controlEffect: "deny" },
  }),
  node("policy:example-monitor", "Policy", "Example: MCP gateway in monitor mode", MCP, {
    boundary: WS,
    description: "Illustrates a monitor-only control. It records calls and blocks nothing.",
    attributes: { enforcementState: "monitor_only", controlEffect: "monitor" },
  }),
];

const edges: GraphEdge[] = [
  edge("app:claude-desktop", "RUNS_AS", "user:dev", APPS, { assertion: "observed" }),
  edge("app:cursor", "RUNS_AS", "user:dev", APPS, { assertion: "observed" }),
  edge("app:terminal", "RUNS_AS", "user:dev", APPS, { assertion: "observed" }),
  edge("app:claude-desktop", "HOSTS", "agent:claude-desktop", APPS, { assertion: "observed" }),
  edge("app:cursor", "HOSTS", "agent:cursor", APPS, { assertion: "observed" }),
  edge("user:dev", "CAN_READ", "res:projects-dir", FILES, { assertion: "observed" }),
  edge("user:dev", "CAN_WRITE", "res:projects-dir", FILES, { assertion: "observed" }),

  edge("agent:claude-desktop", "CONNECTS_TO", "mcp:filesystem", MCP),
  edge("agent:claude-desktop", "CONNECTS_TO", "mcp:github", MCP),
  edge("agent:claude-desktop", "CONNECTS_TO", "mcp:notes-sync", MCP),
  edge("agent:cursor", "CONNECTS_TO", "mcp:github", MCP),
  edge("agent:cursor", "CONNECTS_TO", "mcp:aws", MCP),
  edge("agent:claude-desktop", "AUTHENTICATES_WITH", "oauth:claude-gdrive", GOOGLE),

  edge("mcp:filesystem", "EXPOSES_TOOL", "tool:fs.read_file", MCP),
  edge("mcp:filesystem", "EXPOSES_TOOL", "tool:fs.write_file", MCP),
  edge("mcp:github", "EXPOSES_TOOL", "tool:gh.get_file_contents", MCP),
  edge("mcp:github", "EXPOSES_TOOL", "tool:gh.create_or_update_file", MCP),
  edge("mcp:notes-sync", "EXPOSES_TOOL", "tool:notes.upload", MCP),
  edge("mcp:aws", "EXPOSES_TOOL", "tool:aws.call_aws", MCP),
  edge("tool:fs.read_file", "CAN_READ", "res:projects-dir", MCP),
  edge("tool:fs.write_file", "CAN_WRITE", "res:projects-dir", MCP),

  edge("mcp:github", "AUTHENTICATES_WITH", "cred:github-pat", MCP),
  edge("mcp:notes-sync", "AUTHENTICATES_WITH", "cred:github-pat", MCP),
  edge("mcp:aws", "AUTHENTICATES_WITH", "cred:aws-dev-sso", MCP),
  edge("res:projects-dir", "HOLDS_CREDENTIAL_REFERENCE", "cred:stripe-env", FILES, {
    assertion: "observed",
    requiresAction: "read",
  }),

  edge("cred:github-pat", "GRANTS_SCOPE", "perm:gh-classic-repo", GITHUB, {
    scopes: ["repo", "workflow"],
  }),
  edge("perm:gh-classic-repo", "CAN_READ", "res:repo-payments", GITHUB, {
    assertion: "inferred",
    confidence: "medium",
    inferenceRule: "github-classic-repo-scope-v1",
  }),
  edge("perm:gh-classic-repo", "CAN_WRITE", "res:repo-payments", GITHUB, {
    assertion: "inferred",
    confidence: "medium",
    inferenceRule: "github-classic-repo-scope-v1",
  }),
  edge("perm:gh-classic-repo", "CAN_READ", "res:repo-infra", GITHUB, {
    assertion: "inferred",
    confidence: "medium",
    inferenceRule: "github-classic-repo-scope-v1",
  }),
  edge("perm:gh-classic-repo", "CAN_WRITE", "res:repo-infra", GITHUB, {
    assertion: "inferred",
    confidence: "medium",
    inferenceRule: "github-classic-repo-scope-v1",
  }),
  edge("res:repo-infra", "ASSUMES_ROLE", "role:aws-deploy", AWS, {
    assertion: "inferred",
    confidence: "medium",
    inferenceRule: "gha-oidc-workflow-role-v1",
    requiresAction: "write",
    observedAt: PREVIOUS_SCAN,
    conditions: [
      {
        description: "The role trust policy only accepts OIDC tokens for refs/heads/main",
        state: "unresolved",
      },
      {
        description: "Branch protection does not stop this token from pushing to main",
        state: "unresolved",
      },
    ],
  }),
  edge("res:repo-infra", "CONTROLLED_BY", "policy:gh-branch-protection", GITHUB),
  edge("mcp:notes-sync", "CONTROLLED_BY", "policy:example-monitor", MCP),

  edge("role:aws-deploy", "CAN_WRITE", "res:s3-prod-artifacts", AWS, { observedAt: PREVIOUS_SCAN }),
  edge("role:aws-deploy", "CAN_DELETE", "res:s3-prod-artifacts", AWS, {
    observedAt: PREVIOUS_SCAN,
  }),
  edge("role:aws-deploy", "CAN_EXECUTE", "res:ecs-payments-prod", AWS, {
    observedAt: PREVIOUS_SCAN,
  }),

  edge("cred:aws-dev-sso", "GRANTS_SCOPE", "perm:aws-dev-readonly", AWS),
  edge("perm:aws-dev-readonly", "CAN_READ", "res:s3-dev-logs", AWS),

  edge("cred:stripe-env", "GRANTS_SCOPE", "perm:stripe-secret", FILES, {
    assertion: "inferred",
    confidence: "low",
    inferenceRule: "stripe-secret-key-name-v1",
  }),
  edge("perm:stripe-secret", "CAN_ADMIN", "res:stripe-account", FILES, {
    assertion: "inferred",
    confidence: "low",
    inferenceRule: "stripe-secret-key-name-v1",
  }),

  edge("oauth:claude-gdrive", "GRANTS_SCOPE", "perm:gdrive-readonly", GOOGLE, {
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  }),
  edge("perm:gdrive-readonly", "CAN_READ", "res:gdrive-files", GOOGLE),

  edge("app:terminal", "GRANTS_SCOPE", "perm:tcc-full-disk-access", TCC, {
    assertion: "unknown",
    confidence: "low",
  }),
  edge("perm:tcc-full-disk-access", "CAN_READ", "res:protected-user-data", TCC, {
    assertion: "declared",
  }),
];

function run(
  connectorId: string,
  label: string,
  status: ConnectorRun["status"],
  details: Pick<ConnectorRun, "dataCategories" | "requiredPrivileges" | "coverage" | "blindSpots"> &
    Partial<Pick<ConnectorRun, "errors" | "finishedAt">>,
): ConnectorRun {
  return {
    connectorId,
    label,
    version: "fixture",
    status,
    readOnly: true,
    finishedAt: details.finishedAt ?? COLLECTED_AT,
    dataCategories: details.dataCategories,
    requiredPrivileges: details.requiredPrivileges,
    coverage: details.coverage,
    blindSpots: details.blindSpots,
    errors: details.errors ?? [],
  };
}

const connectorRuns: ConnectorRun[] = [
  run(MCP, "MCP client configurations", "completed", {
    dataCategories: ["server names", "commands", "argument shapes", "env var names"],
    requiredPrivileges: ["Read access to the user's own client config files"],
    coverage: "Claude Desktop and Cursor configuration files.",
    blindSpots: [
      "Servers launched outside these configs",
      "Tool lists are known only when a tools/list snapshot exists",
    ],
  }),
  run(APPS, "Applications and processes", "completed", {
    dataCategories: ["bundle IDs", "code-signing status", "process owner"],
    requiredPrivileges: ["None beyond the user session"],
    coverage: "/Applications and running user processes.",
    blindSpots: ["Processes of other users"],
  }),
  run(FILES, ".env key names", "partial", {
    dataCategories: ["key names only"],
    requiredPrivileges: ["Read access to the selected directories"],
    coverage: "Only ~/Projects, as configured.",
    blindSpots: ["Directories outside the configured scope"],
  }),
  run(GITHUB, "GitHub token metadata", "completed", {
    dataCategories: ["token scopes", "accessible repositories"],
    requiredPrivileges: ["User-authorized, read-only API call"],
    coverage: "Scopes reported by the provider; repository access inferred from scope semantics.",
    blindSpots: ["Fine-grained repository rules", "Organization SSO enforcement"],
  }),
  run(AWS, "AWS IAM (read-only)", "failed", {
    finishedAt: "2026-10-20T08:55:00Z",
    dataCategories: ["roles", "attached policies", "trust policies"],
    requiredPrivileges: ["iam:Get*/List* via an explicitly configured read-only profile"],
    coverage: "Last successful collection 2026-09-28; data retained and marked stale.",
    blindSpots: ["Service control policies", "Resource-based policies not attached to roles"],
    errors: [
      {
        code: "provider_unreachable",
        message: "Refresh failed (fixture). Previous results retained as stale.",
      },
    ],
  }),
  run(GOOGLE, "OAuth grants", "completed", {
    dataCategories: ["granted apps", "scopes"],
    requiredPrivileges: ["User-authorized read of own OAuth grants"],
    coverage: "Grants visible to the signed-in user.",
    blindSpots: ["Domain-wide delegation"],
  }),
  run(TCC, "macOS privacy permissions", "requires_permission", {
    dataCategories: ["privacy permission state"],
    requiredPrivileges: ["An explicitly user-exported report; AgentRadius does not read TCC.db"],
    coverage: "Not collected. Permissions are shown as unknown.",
    blindSpots: ["All TCC-controlled services"],
  }),
  run("runtime.mcp-gateway", "Runtime MCP monitoring", "not_implemented", {
    dataCategories: ["tool calls"],
    requiredPrivileges: ["User opt-in per MCP server"],
    coverage: "Not available yet. No traffic is monitored or blocked.",
    blindSpots: ["All runtime activity"],
  }),
];

export const DEMO_WORKSTATION_SNAPSHOT: Snapshot = {
  schemaVersion: "2.0",
  snapshotId: "fixture-demo-workstation-2026-10-20",
  collectedAt: COLLECTED_AT,
  dataOrigin: "fixture",
  fixtureNotice:
    "Synthetic demo data. None of these applications, credentials, or resources were discovered on this Mac.",
  environmentLabel: "Demo workstation (fixture)",
  nodes,
  edges,
  connectorRuns,
};
