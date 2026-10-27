import {
  analyzeBlastRadius,
  analyzeFindings,
  permissionInventory,
  reachMatrix,
  simulateChanges,
  summarize,
  type AnalysisSettings,
  type BlastRadiusReport,
  type GraphChange,
  type OverviewSummary,
  type PermissionRow,
  type ReachMatrix,
  type SimulationResult,
} from "../analysis/index.ts";
import { declaredAgentsToGraph, scanThisMac, slug } from "../connectors/index.ts";
import {
  MAX_DECLARED_AGENTS,
  SCHEMA_VERSION,
  SnapshotSchema,
  type ConnectorRun,
  type DeclaredAgent,
  type Finding,
  type GraphEdge,
  type GraphNode,
  type Snapshot,
} from "../domain/index.ts";
import { DEMO_WORKSTATION_SNAPSHOT } from "../fixtures/demoWorkstation.ts";
import {
  ingestSnapshot,
  isStale,
  type GraphIndex,
  type IngestIssue,
  type MergeConflict,
  type SnapshotMeta,
} from "../graph/index.ts";

export interface WorkspaceView {
  readonly meta: SnapshotMeta;
  /** Evaluation instant used for freshness. Fixtures are evaluated as of their collection time. */
  readonly asOf: string;
  readonly settings: AnalysisSettings;
  /** Entities whose newest observation is older than the staleness threshold at `asOf`. */
  readonly staleIds: readonly string[];
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly connectorRuns: readonly ConnectorRun[];
  readonly conflicts: readonly MergeConflict[];
  readonly overview: OverviewSummary;
  readonly findings: readonly Finding[];
  readonly permissions: readonly PermissionRow[];
  readonly reach: ReachMatrix;
  /** Agents the user described on the Integrations page. Unverified. */
  readonly declaredAgents: readonly DeclaredAgent[];
  /** When this Mac was last scanned, or null if it hasn't been. */
  readonly scannedAt: string | null;
}

export class WorkspaceError extends Error {
  readonly code: "not_found" | "invalid_snapshot" | "duplicate" | "limit";
  readonly issues: readonly IngestIssue[];
  constructor(code: WorkspaceError["code"], message: string, issues: readonly IngestIssue[] = []) {
    super(message);
    this.code = code;
    this.issues = issues;
  }
}

export interface WorkspaceService {
  view(settings: AnalysisSettings): WorkspaceView;
  blastRadius(startId: string, settings: AnalysisSettings): BlastRadiusReport;
  simulate(
    startId: string,
    changes: readonly GraphChange[],
    settings: AnalysisSettings,
  ): SimulationResult;
}

/**
 * Read-only use cases over one validated snapshot. Holds no mutable state: every call is a pure
 * function of the snapshot, the settings, and the evaluation time.
 */
export function createWorkspaceService(
  rawSnapshot: unknown,
  now: () => Date = () => new Date(),
  declaredAgents: readonly DeclaredAgent[] = [],
): WorkspaceService {
  const result = ingestSnapshot(rawSnapshot);
  if (!result.ok)
    throw new WorkspaceError("invalid_snapshot", "Snapshot failed validation", result.errors);
  const graph = result.graph;
  const asOf = (): string =>
    graph.meta.dataOrigin === "fixture" ? graph.meta.collectedAt : now().toISOString();

  return {
    view(settings) {
      const at = asOf();
      const findings = analyzeFindings(graph, settings, at);
      const freshness = { asOf: at, stalenessThresholdHours: settings.stalenessThresholdHours };
      const nodes = sortedValues(graph.nodes);
      const edges = sortedValues(graph.edges);
      return {
        meta: graph.meta,
        asOf: at,
        settings,
        staleIds: [...nodes, ...edges]
          .filter((x) => isStale(x.provenance, freshness))
          .map((x) => x.id),
        nodes,
        edges,
        connectorRuns: graph.connectorRuns,
        conflicts: graph.conflicts,
        overview: summarize(graph, findings, freshness),
        findings,
        permissions: permissionInventory(graph),
        reach: reachMatrix(graph, settings, at),
        declaredAgents,
        scannedAt: graph.meta.dataOrigin === "local_discovery" ? graph.meta.collectedAt : null,
      };
    },
    blastRadius(startId, settings) {
      requireKnownNode(graph, startId);
      return analyzeBlastRadius(graph, startId, settings, asOf());
    },
    simulate(startId, changes, settings) {
      requireKnownNode(graph, startId);
      return simulateChanges(graph, startId, changes, settings, asOf());
    },
  };
}

/** The explicitly labeled synthetic workspace. */
export function createDemoWorkspaceService(): WorkspaceService {
  return createWorkspaceService(DEMO_WORKSTATION_SNAPSHOT);
}

export type AgentDeclarationInput = Omit<DeclaredAgent, "id" | "declaredAt">;

/**
 * Holds the workspace currently shown: empty until the user adds an agent or scans this Mac. It
 * never contains synthetic data. Everything lives in memory only. A failed scan or a rejected
 * declaration keeps the previous workspace.
 */
export interface WorkspaceSession {
  current(): WorkspaceService;
  scan(): Promise<void>;
  declareAgent(input: AgentDeclarationInput): void;
  removeAgent(id: string): void;
}

/** Session whose scan reads this Mac's MCP client configs (read-only, in memory). */
export function createLocalWorkspaceSession(homeDir: string): WorkspaceSession {
  return createWorkspaceSession(() => scanThisMac({ homeDir, now: new Date() }));
}

export function createWorkspaceSession(
  scanSnapshot: () => Promise<unknown>,
  now: () => Date = () => new Date(),
  /** Tests only. The app always starts from the empty workspace. */
  initial?: Snapshot,
): WorkspaceSession {
  let base: Snapshot = initial ?? emptySnapshot(now());
  let declared: readonly DeclaredAgent[] = [];
  let active = createWorkspaceService(base, now);
  let inFlight: Promise<void> | null = null;

  /** Builds first and commits only on success, so a rejected change leaves the session intact. */
  const commit = (nextBase: Snapshot, nextDeclared: readonly DeclaredAgent[]) => {
    active = createWorkspaceService(withDeclaredAgents(nextBase, nextDeclared), now, nextDeclared);
    base = nextBase;
    declared = nextDeclared;
  };

  return {
    current: () => active,
    scan() {
      inFlight ??= scanSnapshot()
        .then((raw) => {
          createWorkspaceService(raw, now);
          commit(SnapshotSchema.parse(raw), declared);
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    declareAgent(input) {
      const id = `agent:declared.${slug(input.name)}`;
      if (declared.some((a) => a.id === id))
        throw new WorkspaceError("duplicate", "An agent with this name was already added");
      if (declared.length >= MAX_DECLARED_AGENTS)
        throw new WorkspaceError("limit", `You can add up to ${MAX_DECLARED_AGENTS} agents`);
      const agent: DeclaredAgent = { ...input, id, declaredAt: now().toISOString() };
      commit(
        base,
        [...declared, agent].sort((a, b) => a.id.localeCompare(b.id)),
      );
    },
    removeAgent(id) {
      const agent = declared.find((a) => a.id === id);
      if (agent === undefined) throw new WorkspaceError("not_found", "Unknown entity");
      commit(
        base,
        declared.filter((a) => a.id !== id),
      );
    },
  };
}

/** The starting workspace: nothing scanned, nothing added. */
function emptySnapshot(at: Date): Snapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    snapshotId: "workspace:empty",
    collectedAt: at.toISOString(),
    dataOrigin: "import",
    environmentLabel: "This Mac (not scanned yet)",
    nodes: [],
    edges: [],
    connectorRuns: [],
  };
}

function withDeclaredAgents(base: Snapshot, agents: readonly DeclaredAgent[]): Snapshot {
  if (agents.length === 0) return base;
  const declared = declaredAgentsToGraph(agents);
  return {
    ...base,
    nodes: [...base.nodes, ...declared.nodes],
    edges: [...base.edges, ...declared.edges],
    connectorRuns: [...base.connectorRuns, declared.run],
  };
}

function requireKnownNode(graph: GraphIndex, id: string): void {
  if (!graph.nodes.has(id)) throw new WorkspaceError("not_found", "Unknown entity");
}

function sortedValues<T>(map: ReadonlyMap<string, T>): T[] {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
}
