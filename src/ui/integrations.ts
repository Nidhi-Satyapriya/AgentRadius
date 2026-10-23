import type { WorkspaceResponse } from "../api/contracts.ts";
import {
  catalogApp,
  compareSeverity,
  DECLARED_CONNECTOR_ID,
  type ConnectorStatus,
  type Severity,
} from "../domain/core.ts";
import type { WorkspaceModel } from "./workspace.tsx";

type ConnectorRun = WorkspaceResponse["connectorRuns"][number];
type DeclaredAgent = WorkspaceResponse["declaredAgents"][number];

export const CATEGORIES = ["local", "declared", "account", "demo"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  local: "On this Mac",
  declared: "Added by you",
  account: "Accounts",
  demo: "Demo",
};

export type IntegrationRow =
  | (Base & { readonly kind: "source"; readonly run: ConnectorRun })
  | (Base & { readonly kind: "declared"; readonly agent: DeclaredAgent })
  | (Base & { readonly kind: "account"; readonly covers: string });

interface Base {
  readonly id: string;
  readonly name: string;
  readonly category: Category;
  readonly status: { readonly label: string; readonly tone: "ok" | "warn" | "bad" | "neutral" };
  readonly auth: string;
  readonly lastSync: string | null;
  /** Entities this source contributed (excluding trust boundaries). */
  readonly found: number | null;
  readonly risk: Severity | null;
}

/** Account providers whose sign-in is not built yet. Listed so users know where they stand. */
const ACCOUNTS: readonly { id: string; name: string; covers: string }[] = [
  { id: "account:github", name: "GitHub", covers: "Repositories, tokens, and app installs" },
  { id: "account:atlassian", name: "Atlassian", covers: "Confluence spaces and Jira projects" },
  { id: "account:google", name: "Google Workspace", covers: "Gmail, Calendar, and Drive grants" },
  { id: "account:microsoft", name: "Microsoft 365", covers: "Outlook, Teams, and SharePoint" },
  { id: "account:slack", name: "Slack", covers: "Workspace apps and bot scopes" },
  { id: "account:aws", name: "AWS", covers: "IAM roles and policies" },
];

const STATUS: Readonly<Record<ConnectorStatus, Base["status"]>> = {
  completed: { label: "Read", tone: "ok" },
  partial: { label: "Partly read", tone: "warn" },
  requires_permission: { label: "Needs access", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
  unsupported: { label: "Not supported", tone: "neutral" },
  disabled: { label: "Off", tone: "neutral" },
  not_implemented: { label: "Not available", tone: "neutral" },
};

/** What to do about each connector error code. Codes only; messages never quote file content. */
export const ERROR_NEXT_STEP: Readonly<Record<string, string>> = {
  permission_denied: "Allow your user account to read the file, then sync again.",
  parse_error: "Fix the file's JSON syntax, then sync again.",
  too_large: "The file is over 1 MB and was skipped.",
  not_a_file: "The path is not a regular file, so it was skipped.",
  read_error: "Sync again. If it keeps failing, check the file's permissions.",
  provider_unreachable: "Sync again later. Earlier results are kept and marked stale.",
};

function maxSeverity(severities: readonly Severity[]): Severity | null {
  return [...severities].sort(compareSeverity)[0] ?? null;
}

export function integrationRows(ws: WorkspaceModel): IntegrationRow[] {
  const { data } = ws;
  const byConnector = new Map<string, Set<string>>();
  for (const n of data.nodes) {
    if (n.type === "TrustBoundary") continue;
    for (const p of n.provenance) {
      const ids = byConnector.get(p.connectorId) ?? new Set<string>();
      ids.add(n.id);
      byConnector.set(p.connectorId, ids);
    }
  }
  const riskOf = (ids: Iterable<string>) =>
    maxSeverity([...ids].flatMap((id) => ws.findingsFor(id).map((f) => f.severity)));

  const sources: IntegrationRow[] = data.connectorRuns
    .filter((r) => r.connectorId !== DECLARED_CONNECTOR_ID)
    .map((run) => {
      const ids = byConnector.get(run.connectorId) ?? new Set<string>();
      const demo = data.meta.dataOrigin === "fixture";
      return {
        kind: "source",
        run,
        id: run.connectorId,
        name: run.label,
        category: demo ? "demo" : "local",
        status: STATUS[run.status],
        auth: demo ? "Demo data" : "Reads local files",
        lastSync: run.status === "not_implemented" ? null : (run.finishedAt ?? null),
        found: run.status === "not_implemented" ? null : ids.size,
        risk: riskOf(ids),
      };
    });

  const declared: IntegrationRow[] = data.declaredAgents.map((agent) => ({
    kind: "declared",
    agent,
    id: agent.id,
    name: agent.name,
    category: "declared",
    status: { label: "Not verified", tone: "neutral" },
    auth: "Entered by you",
    lastSync: agent.declaredAt,
    found: agent.appIds.filter((id) => catalogApp(id)).length,
    risk: riskOf([agent.id]),
  }));

  const accounts: IntegrationRow[] = ACCOUNTS.map((a) => ({
    kind: "account",
    covers: a.covers,
    id: a.id,
    name: a.name,
    category: "account",
    status: { label: "Not available", tone: "neutral" },
    auth: "—",
    lastSync: null,
    found: null,
    risk: null,
  }));

  return [...sources, ...declared, ...accounts];
}

export function monogram(label: string): string {
  const words = label
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(" ")
    .filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
