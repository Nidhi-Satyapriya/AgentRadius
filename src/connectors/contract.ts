import type { Platform } from "./mcpConfig/clients.ts";
import type { ConnectorRun, GraphEdge, GraphNode } from "../domain/index.ts";

/**
 * Normalized output of one connector run. Connectors never mutate anything; they return graph
 * records plus a run report that states what was read, what failed, and what remains unseen.
 */
export interface ConnectorResult {
  readonly run: ConnectorRun;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** Injected so connectors stay testable and never touch the real home directory in tests. */
export interface ScanContext {
  readonly homeDir: string;
  readonly now: Date;
  /** Which operating system's file locations to read. Defaults to the one MCPRadius runs on. */
  readonly platform?: Platform;
}
