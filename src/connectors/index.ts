import { SCHEMA_VERSION, type Snapshot } from "../domain/index.ts";
import type { ConnectorResult, ScanContext } from "./contract.ts";
import { scanMcpClients } from "./mcpConfig/scan.ts";

export type { ConnectorResult, ScanContext } from "./contract.ts";
export { declaredAgentsToGraph } from "./declaredAgents.ts";
export { slug } from "./mcpConfig/toGraph.ts";

/**
 * Runs every enabled local connector and assembles one snapshot. Read-only: connectors read a
 * fixed list of files and never execute, write, or contact anything.
 */
export async function scanThisMac(context: ScanContext): Promise<Snapshot> {
  const results: ConnectorResult[] = await scanMcpClients(context);
  return {
    schemaVersion: SCHEMA_VERSION,
    snapshotId: `local:${context.now.toISOString()}`,
    collectedAt: context.now.toISOString(),
    dataOrigin: "local_discovery",
    environmentLabel: "This Mac",
    nodes: results.flatMap((r) => r.nodes),
    edges: results.flatMap((r) => r.edges),
    connectorRuns: results.map((r) => r.run),
  };
}
