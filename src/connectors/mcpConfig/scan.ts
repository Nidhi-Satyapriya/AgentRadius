import { join } from "node:path";
import type { ConnectorRun, ConnectorStatus } from "../../domain/index.ts";
import type { ConnectorResult, ScanContext } from "../contract.ts";
import { pathExists, readConfigFile, type ConfigReadResult } from "../fileAccess.ts";
import { parseJsonc } from "../jsonc.ts";
import { currentPlatform, mcpClientsFor, PLATFORM_LABELS, type McpClient } from "./clients.ts";
import { extractServers, tildify } from "./parse.ts";
import { discoverPluginLocations } from "./plugins.ts";
import { clientToGraph, type ParsedFile } from "./toGraph.ts";

export const MCP_CONFIG_CONNECTOR_VERSION = "1.0.0";

const DATA_CATEGORIES = [
  "MCP server names, transports, and launch commands (secret-shaped arguments redacted)",
  "Names of environment variables and HTTP headers (values are discarded while parsing)",
  "Where each credential value is stored (plain text, secret manager, prompt, environment)",
  "Whether the client application is installed",
];

const BLIND_SPOTS = [
  "Project-level configs inside repositories (for example .cursor/mcp.json or .vscode/mcp.json) are not scanned.",
  "Servers are never started, so the tools each one exposes are unknown.",
  "What a server can do inside a SaaS product depends on the account and token permissions, which are not collected yet.",
  "Configured is not the same as running: a configured server may never have been used.",
];

interface FileOutcome {
  readonly displayPath: string;
  readonly read: ConfigReadResult;
  readonly parsed?: ParsedFile;
  readonly parseFailed?: boolean;
}

/** Reads every known MCP client config. Read-only; never executes anything it finds. */
export async function scanMcpClients(
  context: ScanContext,
  clients: readonly McpClient[] = mcpClientsFor(context.platform ?? currentPlatform()),
): Promise<ConnectorResult[]> {
  return Promise.all(clients.map((client) => scanClient(client, context)));
}

async function scanClient(client: McpClient, context: ScanContext): Promise<ConnectorResult> {
  const startedAt = new Date().toISOString();
  const observedAt = context.now.toISOString();
  const connectorId = `local.mcp-config.${client.id}`;
  const outcomes: FileOutcome[] = [];
  const plugins =
    client.pluginCacheRoot === undefined
      ? []
      : await discoverPluginLocations(context.homeDir, client.pluginCacheRoot);
  for (const location of [...client.locations, ...plugins]) {
    const absolute = join(context.homeDir, location.relativePath);
    const displayPath = tildify(absolute, context.homeDir);
    const read = await readConfigFile(absolute);
    if (read.kind !== "ok") {
      outcomes.push({ displayPath, read });
      continue;
    }
    try {
      const servers = extractServers(
        parseJsonc(read.text),
        location.format,
        context.homeDir,
        location.scope,
      );
      outcomes.push({ displayPath, read, parsed: { displayPath, servers } });
    } catch {
      // Parser messages can quote file content, so only a generic error is reported.
      outcomes.push({ displayPath, read, parseFailed: true });
    }
  }
  const appInstalled =
    client.appPath === undefined
      ? undefined
      : await pathExists(
          client.appPath.homeRelative
            ? join(context.homeDir, client.appPath.path)
            : client.appPath.path,
        );
  const osLabel = PLATFORM_LABELS[context.platform ?? currentPlatform()];
  const parsedFiles = outcomes.flatMap((o) => (o.parsed !== undefined ? [o.parsed] : []));
  const graph =
    parsedFiles.length > 0
      ? clientToGraph({ client, connectorId, observedAt, appInstalled, files: parsedFiles })
      : { nodes: [], edges: [], serverCount: 0 };

  const run: ConnectorRun = {
    connectorId,
    label: `${client.label} MCP configuration`,
    version: MCP_CONFIG_CONNECTOR_VERSION,
    status: statusOf(outcomes),
    readOnly: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    dataCategories: DATA_CATEGORIES,
    requiredPrivileges: [
      `Read access, as your ${osLabel} user, to: ${outcomes.map((o) => o.displayPath).join(", ")}`,
    ],
    coverage: coverageOf(client, outcomes, graph.serverCount, appInstalled),
    blindSpots:
      client.pluginCacheRoot === undefined
        ? BLIND_SPOTS
        : [
            ...BLIND_SPOTS,
            "Plugin servers are read from the newest cached plugin version; whether each plugin is currently enabled is not determined.",
          ],
    errors: outcomes.flatMap(errorOf),
  };
  return { run, nodes: graph.nodes, edges: graph.edges };
}

function statusOf(outcomes: readonly FileOutcome[]): ConnectorStatus {
  const ok = outcomes.filter((o) => o.parsed !== undefined).length;
  const problems = outcomes.filter((o) => o.read.kind !== "missing" && o.parsed === undefined);
  if (problems.length === 0) return "completed";
  if (ok > 0) return "partial";
  return problems.every((o) => o.read.kind === "denied") ? "requires_permission" : "failed";
}

function coverageOf(
  client: McpClient,
  outcomes: readonly FileOutcome[],
  serverCount: number,
  appInstalled: boolean | undefined,
): string {
  const found = outcomes.filter((o) => o.parsed !== undefined).map((o) => o.displayPath);
  if (found.length === 0) {
    const notInstalled =
      appInstalled === false ? ` ${client.label} does not appear to be installed.` : "";
    return `No ${client.label} MCP configuration was found.${notInstalled}`;
  }
  return `Read ${found.join(" and ")}: ${serverCount} MCP server${serverCount === 1 ? "" : "s"} configured.`;
}

function errorOf(outcome: FileOutcome): { code: string; message: string }[] {
  const { read, displayPath } = outcome;
  if (outcome.parseFailed === true)
    return [{ code: "parse_error", message: `${displayPath} is not valid JSON or JSONC.` }];
  switch (read.kind) {
    case "ok":
    case "missing":
      return [];
    case "denied":
      return [
        {
          code: "permission_denied",
          message: `The operating system denied read access to ${displayPath}.`,
        },
      ];
    case "not_a_file":
      return [{ code: "not_a_file", message: `${displayPath} is not a regular file; skipped.` }];
    case "too_large":
      return [{ code: "too_large", message: `${displayPath} is larger than 1 MB; skipped.` }];
    case "error":
      return [{ code: "read_error", message: `${displayPath} could not be read (${read.code}).` }];
  }
}
