import type { BlastRadiusResponse } from "../../api/contracts.ts";
import { EDGE_SEMANTICS } from "../../domain/core.ts";
import { useWorkspace } from "../workspace.tsx";
import { AssertionBadge, ConfidenceBadge, StaleBadge } from "./Badges.tsx";

export type PathSummary = BlastRadiusResponse["reached"][number]["path"];

export interface PathExplanationProps {
  readonly path: Pick<PathSummary, "steps"> & Partial<PathSummary>;
  readonly onSimulateRemove?: (edgeId: string) => void;
}

/** Renders a path as a readable chain: one sentence per hop with the evidence behind it. */
export function PathExplanation({ path, onSimulateRemove }: PathExplanationProps) {
  const ws = useWorkspace();
  const stale = new Set(path.staleEdgeIds ?? []);
  const conditional = new Set(path.conditionalEdgeIds ?? []);
  return (
    <div className="path">
      {path.assertion && path.confidence && (
        <p className="path-summary">
          Path evidence: <AssertionBadge value={path.assertion} />{" "}
          <ConfidenceBadge value={path.confidence} />
          <span className="muted"> (a path is only as strong as its weakest hop)</span>
        </p>
      )}
      <ol className="path-steps">
        {path.steps.map((step) => {
          const edge = ws.edge(step.edgeId);
          const verb = EDGE_SEMANTICS[step.edgeType].verb;
          const [subject, object] =
            step.direction === "reverse" ? [step.toId, step.fromId] : [step.fromId, step.toId];
          return (
            <li key={step.edgeId}>
              <span>
                <strong>{ws.label(subject)}</strong> {verb} <strong>{ws.label(object)}</strong>
                {step.direction === "reverse" && (
                  <span className="muted">
                    {" "}
                    (trust is followed in reverse: controlling the trusted side affects the truster)
                  </span>
                )}
              </span>
              <span className="step-badges">
                {edge && <AssertionBadge value={edge.assertion} />}
                {edge && <ConfidenceBadge value={edge.confidence} />}
                {stale.has(step.edgeId) && <StaleBadge />}
                {conditional.has(step.edgeId) && (
                  <span
                    className="badge badge-conditional"
                    title="Depends on a condition MCPRadius could not resolve"
                  >
                    conditional
                  </span>
                )}
                {edge?.inferenceRule && <span className="muted">rule: {edge.inferenceRule}</span>}
                {onSimulateRemove && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => onSimulateRemove(step.edgeId)}
                  >
                    What if removed?
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
