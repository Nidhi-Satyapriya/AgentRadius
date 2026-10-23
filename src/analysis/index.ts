import { compareSeverity, type Finding } from "../domain/index.ts";
import type { GraphIndex } from "../graph/index.ts";
import { computeBlastRadius, type BlastRadiusResult } from "./blastRadius.ts";
import type { FindingRule } from "./findings/ruleKit.ts";
import { evaluateRules, FINDING_RULES } from "./findings/rules.ts";
import { suggestMitigations, type Mitigation } from "./mitigations.ts";
import type { AnalysisSettings } from "./settings.ts";

export * from "./blastRadius.ts";
export * from "./controls.ts";
export * from "./mitigations.ts";
export * from "./overview.ts";
export * from "./permissionInventory.ts";
export * from "./reachMatrix.ts";
export * from "./settings.ts";
export * from "./simulation.ts";
export { FINDING_RULES } from "./findings/rules.ts";
export type { FindingRule } from "./findings/ruleKit.ts";

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

/** Runs every rule deterministically; output is sorted by severity, then ID, with no duplicates. */
export function analyzeFindings(
  graph: GraphIndex,
  settings: AnalysisSettings,
  asOf: string,
  rules: readonly FindingRule[] = FINDING_RULES,
): Finding[] {
  const memo = new Map<string, BlastRadiusResult>();
  const blastRadius = (startId: string): BlastRadiusResult => {
    let result = memo.get(startId);
    if (result === undefined) {
      result = computeBlastRadius(graph, startId, settings, asOf);
      memo.set(startId, result);
    }
    return result;
  };
  const unique = new Map<string, Finding>();
  for (const finding of evaluateRules({ graph, settings, asOf, blastRadius }, rules)) {
    if (!unique.has(finding.id)) unique.set(finding.id, finding);
  }
  return [...unique.values()].sort(
    (a, b) => compareSeverity(a.severity, b.severity) || a.id.localeCompare(b.id),
  );
}
