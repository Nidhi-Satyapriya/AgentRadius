import type {
  Assertion,
  Attributes,
  CollectionMethod,
  Condition,
  Confidence,
  EdgeType,
  GraphEdge,
  GraphNode,
  NodeType,
} from "../../domain/index.ts";
import type { McpClient } from "./clients.ts";
import { matchService, type ServiceMatch } from "./knownServices.ts";
import type { NamedKey, ServerDeclaration } from "./parse.ts";

export const LOCAL_BOUNDARY_ID = "tb:this-mac";

export interface ParsedFile {
  /** Display path with the home directory shortened to `~`. */
  readonly displayPath: string;
  readonly servers: readonly ServerDeclaration[];
}

export interface ClientObservation {
  readonly client: McpClient;
  readonly connectorId: string;
  readonly observedAt: string;
  /** `undefined` when the client has no app bundle to check (CLI tools). */
  readonly appInstalled: boolean | undefined;
  readonly files: readonly ParsedFile[];
}

class GraphBuilder {
  readonly nodes = new Map<string, GraphNode>();
  readonly edges = new Map<string, GraphEdge>();
  readonly connectorId: string;
  readonly observedAt: string;

  constructor(connectorId: string, observedAt: string) {
    this.connectorId = connectorId;
    this.observedAt = observedAt;
  }

  private provenance(evidenceRef: string, method: CollectionMethod) {
    return [
      {
        connectorId: this.connectorId,
        evidenceRef,
        observedAt: this.observedAt,
        collectionMethod: method,
      },
    ];
  }

  node(
    id: string,
    type: NodeType,
    label: string,
    evidenceRef: string,
    options: {
      boundary?: string;
      description?: string;
      attributes?: Attributes;
      method?: CollectionMethod;
    } = {},
  ): void {
    if (this.nodes.has(id)) return;
    this.nodes.set(id, {
      id,
      type,
      label,
      ...(options.description !== undefined ? { description: options.description } : {}),
      ...(options.boundary !== undefined ? { trustBoundaryId: options.boundary } : {}),
      attributes: options.attributes ?? {},
      provenance: this.provenance(evidenceRef, options.method ?? "config_parse"),
    });
  }

  edge(
    from: string,
    type: EdgeType,
    to: string,
    evidenceRef: string,
    options: {
      assertion?: Assertion;
      confidence?: Confidence;
      inferenceRule?: string;
      conditions?: Condition[];
      attributes?: Attributes;
    } = {},
  ): void {
    const id = `edge:${from}>${type.toLowerCase()}>${to}`;
    if (this.edges.has(id)) return;
    this.edges.set(id, {
      id,
      type,
      from,
      to,
      assertion: options.assertion ?? "declared",
      confidence: options.confidence ?? "high",
      lifecycle: "active",
      ...(options.inferenceRule !== undefined ? { inferenceRule: options.inferenceRule } : {}),
      conditions: options.conditions ?? [],
      attributes: options.attributes ?? {},
      provenance: this.provenance(
        evidenceRef,
        options.inferenceRule ? "inference_rule" : "config_parse",
      ),
    });
  }
}

/** Lowercase, ID-safe slug. Never empty. */
export function slug(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s === "" ? "unnamed" : s.slice(0, 80);
}

const DISABLED: Condition = {
  description: "The server is marked disabled in the client configuration",
  state: "does_not_hold",
};

const MATCH_EVIDENCE: Record<
  ServiceMatch["kind"],
  { assertion: Assertion; confidence: Confidence; rule?: string }
> = {
  host: { assertion: "declared", confidence: "high" },
  package: { assertion: "inferred", confidence: "medium", rule: "known-mcp-package" },
  name: { assertion: "inferred", confidence: "low", rule: "mcp-server-name-hint" },
};

export function clientToGraph(observation: ClientObservation): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  serverCount: number;
} {
  const { client, files } = observation;
  const g = new GraphBuilder(observation.connectorId, observation.observedAt);
  const firstFile = files[0]?.displayPath ?? client.label;
  const appId = `app:${client.id}`;
  const agentId = `agent:${client.id}`;

  g.node(LOCAL_BOUNDARY_ID, "TrustBoundary", "This Mac — your user session", firstFile);
  g.node(appId, "Application", client.label, client.appBundle ?? firstFile, {
    boundary: LOCAL_BOUNDARY_ID,
    method: "filesystem_metadata",
    attributes: {
      ...(observation.appInstalled !== undefined
        ? { installed: observation.appInstalled }
        : { kind: "command-line tool" }),
      configFiles: files.map((f) => f.displayPath),
    },
  });
  g.node(agentId, "Agent", `${client.label} agent`, firstFile, {
    boundary: LOCAL_BOUNDARY_ID,
    description: `The AI agent inside ${client.label}. It can reach whatever its configured MCP servers expose.`,
  });
  g.edge(appId, "HOSTS", agentId, firstFile, { confidence: "medium" });

  const usedIds = new Set<string>();
  let serverCount = 0;
  for (const file of files) {
    for (const server of file.servers) {
      serverCount++;
      const evidence = `${file.displayPath}#${server.pointer}`;
      const serverId = uniqueId(`mcp:${client.id}.${slug(server.name)}`, usedIds);
      const match = matchService({
        ...(server.packageName !== undefined ? { packageName: server.packageName } : {}),
        ...(server.remoteHost !== undefined ? { remoteHost: server.remoteHost } : {}),
        serverName: server.name,
      });
      g.node(serverId, "MCPServer", server.name, evidence, {
        boundary: LOCAL_BOUNDARY_ID,
        description: describeServer(server, client.label),
        attributes: serverAttributes(server, match),
      });
      g.edge(agentId, "CONNECTS_TO", serverId, evidence, {
        conditions: server.disabled ? [DISABLED] : [],
      });

      for (const [kind, keys] of [
        ["env", server.env],
        ["header", server.headers],
      ] as const) {
        for (const key of keys) {
          if (!key.secretBearing) continue;
          const credId = `cred:${serverId.slice(4)}.${kind}.${slug(key.key)}`;
          g.node(
            credId,
            "CredentialReference",
            `${key.key} (${kind === "env" ? "env var" : "header"} of ${server.name})`,
            evidence,
            {
              boundary: LOCAL_BOUNDARY_ID,
              description: credentialDescription(key, kind, file.displayPath),
              attributes: {
                credentialStorage: key.storage === "empty" ? "unknown" : key.storage,
                valueCollected: false,
              },
            },
          );
          g.edge(serverId, "AUTHENTICATES_WITH", credId, evidence);
        }
      }

      const remoteHost = server.remoteHost;
      if (match !== undefined) {
        const { service, kind } = match;
        const tbId = `tb:saas.${service.id}`;
        const resId = `res:saas.${service.id}`;
        g.node(tbId, "TrustBoundary", service.label, evidence);
        g.node(resId, "Resource", `${service.label} — data reachable through MCP`, evidence, {
          boundary: tbId,
          description:
            "What the agent can actually do here depends on the account and token behind the server, which AgentRadius has not collected yet.",
          attributes: service.arbitraryEgress === true ? { networkEgress: true } : {},
        });
        const ev = MATCH_EVIDENCE[kind];
        g.edge(serverId, "REACHES", resId, evidence, {
          assertion: ev.assertion,
          confidence: ev.confidence,
          ...(ev.rule !== undefined ? { inferenceRule: ev.rule } : {}),
          attributes: { matchedBy: kind },
        });
      } else if (remoteHost !== undefined) {
        const tbId = `tb:remote.${slug(remoteHost)}`;
        const resId = `res:remote.${slug(remoteHost)}`;
        g.node(tbId, "TrustBoundary", remoteHost, evidence);
        g.node(resId, "Resource", `Remote MCP service at ${remoteHost}`, evidence, {
          boundary: tbId,
        });
        g.edge(serverId, "REACHES", resId, evidence);
      }
    }
  }
  return { nodes: [...g.nodes.values()], edges: [...g.edges.values()], serverCount };
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  used.add(id);
  return id;
}

function serverAttributes(server: ServerDeclaration, match: ServiceMatch | undefined): Attributes {
  return {
    transport: server.transport,
    scope: server.scope,
    ...(server.command !== undefined ? { command: server.command } : {}),
    ...(server.args.length > 0 ? { args: [...server.args] } : {}),
    ...(server.remoteUrl !== undefined ? { url: server.remoteUrl } : {}),
    ...(server.packageSource !== undefined ? { packageSource: server.packageSource } : {}),
    ...(server.packageName !== undefined ? { package: server.packageName } : {}),
    ...(server.versionPinned !== undefined ? { versionPinned: server.versionPinned } : {}),
    ...(server.env.length > 0 ? { envKeys: server.env.map((k) => k.key) } : {}),
    ...(server.headers.length > 0 ? { headerKeys: server.headers.map((k) => k.key) } : {}),
    ...(match?.service.arbitraryEgress === true ? { networkEgress: true } : {}),
    ...(server.disabled ? { disabled: true } : {}),
  };
}

function describeServer(server: ServerDeclaration, clientLabel: string): string {
  const how =
    server.remoteHost !== undefined
      ? `remote server at ${server.remoteHost}`
      : server.packageName !== undefined
        ? `${server.packageSource ?? "local"} package ${server.packageName}`
        : `local command ${server.command ?? "(unknown)"}`;
  return `Configured in ${clientLabel} (${server.scope} scope) as a ${how}. Declared in configuration; AgentRadius did not start it, so its tools are not listed.`;
}

const STORAGE_TEXT: Record<NamedKey["storage"], string> = {
  plaintext_config: "is written in plain text in",
  secret_manager_reference: "is a secret-manager reference in",
  prompted_input: "is prompted for by the client, as configured in",
  environment_reference: "is read from the launching environment, as configured in",
  file_reference: "points to a credential file, as configured in",
  unknown: "has an unrecognized value in",
  empty: "is empty in",
};

function credentialDescription(key: NamedKey, kind: "env" | "header", path: string): string {
  return `The value of ${kind === "env" ? "environment variable" : "header"} ${key.key} ${STORAGE_TEXT[key.storage]} ${path}. The value was not collected.`;
}
