import type { GraphIndex } from "../graph/index.ts";
import { computeBlastRadius, type BlastRadiusResult } from "./blastRadius.ts";
import { suggestMitigations, type Mitigation } from "./mitigations.ts";
import type { AnalysisSettings } from "./settings.ts";

export * from "./blastRadius.ts";
export * from "./controls.ts";
export * from "./mitigations.ts";
export * from "./settings.ts";
export * from "./simulation.ts";

export interface BlastRadiusReport extends BlastRadiusResult {
  readonly mitigations: readonly Mitigation[];
}

export function analyzeBlastRadius(
  graph: GraphIndex,
  startId: string,
  settings: AnalysisSettings,
  asOf: string,
): BlastRadiusReport {
  const result = computeBlastRadius(graph, startId, settings, asOf);
  return { ...result, mitigations: suggestMitigations(graph, result, settings) };
}
