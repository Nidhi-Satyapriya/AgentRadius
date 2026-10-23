import { useEffect, useMemo, useState } from "react";
import type {
  BlastRadiusResponse,
  SimulationRequest,
  SimulationResponse,
  WorkspaceResponse,
} from "../../api/contracts.ts";
import {
  compareSeverity,
  EDGE_SEMANTICS,
  NODE_TYPES,
  weakerAssertion,
  type EdgeType,
  type NodeType,
} from "../../domain/core.ts";
import { api } from "../api.ts";
import { AssertionBadge, EnforcementBadge, SeverityBadge } from "../components/Badges.tsx";
import { PathExplanation } from "../components/PathExplanation.tsx";
import { Empty, ErrorState, Loading } from "../components/States.tsx";
import { ACTION_VERBS, plural, TYPE_LABELS } from "../labels.ts";
import { href } from "../routing.ts";
import { useAsyncTask, type AsyncState } from "../useAsync.ts";
import { useWorkspace } from "../workspace.tsx";

type AnalysisSettings = WorkspaceResponse["settings"];
type ChangeList = SimulationRequest["changes"];

const START_TYPES: readonly NodeType[] = [
  "Agent",
  "MCPServer",
  "Application",
  "Tool",
  "CredentialReference",
  "OAuthGrant",
  "UserIdentity",
];
const SENSITIVITY_ORDER = ["critical", "high", "moderate", "low", "unclassified"];
const EXCLUSION_TEXT: Record<string, string> = {
  revoked: "relationship is revoked",
  condition_does_not_hold: "a required condition does not hold",
  unknown_excluded: "evidence is unknown (excluded by settings)",
  inferred_excluded: "inferred (excluded by settings)",
  hypothetical_excluded: "hypothetical (excluded by settings)",
  required_access_not_reached: "requires access that was never reached",
  depth_limit: "beyond the maximum depth",
};

export function BlastRadiusPage({ startId }: { startId: string | null }) {
  const ws = useWorkspace();
  const candidates = useMemo(
    () =>
      ws.data.nodes
        .filter((n) => START_TYPES.includes(n.type))
        .sort(
          (a, b) =>
            START_TYPES.indexOf(a.type) - START_TYPES.indexOf(b.type) ||
            a.label.localeCompare(b.label),
        ),
    [ws.data.nodes],
  );
  const [mode, setMode] = useState<"one" | "compare">(startId ? "one" : "one");
  const [start, setStart] = useState(() => startId ?? candidates[0]?.id ?? "");
  const [settings, setSettings] = useState<AnalysisSettings>(ws.data.settings);
  const analysis = useAsyncTask((id: string, s: AnalysisSettings) =>
    api.blastRadius({ startId: id, settings: s }),
  );
  const simulation = useAsyncTask((id: string, changes: ChangeList, s: AnalysisSettings) =>
    api.simulate({ startId: id, changes, settings: s }),
  );
  const { run: runAnalysis } = analysis;
  const { reset: resetSimulation } = simulation;

  useEffect(() => {
    if (start === "" || mode !== "one") return;
    runAnalysis(start, settings);
    resetSimulation();
  }, [start, settings, mode, runAnalysis, resetSimulation]);

  const simulate = (changes: ChangeList) => simulation.run(start, changes, settings);

  return (
    <div className="page">
      <header className="page-header">
        <h2>Blast Radius</h2>
        <p className="muted">
          What could be affected if one agent, app, or credential were compromised.
        </p>
      </header>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="View">
          <label>
            <input
              type="radio"
              name="br-mode"
              checked={mode === "one"}
              onChange={() => setMode("one")}
            />
            One entity
          </label>
          <label>
            <input
              type="radio"
              name="br-mode"
              checked={mode === "compare"}
              onChange={() => setMode("compare")}
            />
            Compare agents
          </label>
        </div>
        {mode === "one" && (
          <label className="field-inline">
            <span>Assume compromised</span>
            <select value={start} onChange={(e) => setStart(e.target.value)}>
              {NODE_TYPES.filter((t) => START_TYPES.includes(t)).map((t) => (
                <optgroup key={t} label={TYPE_LABELS[t]}>
                  {candidates
                    .filter((n) => n.type === t)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
      </div>
      {mode === "compare" ? (
        <AgentComparison />
      ) : candidates.length === 0 ? (
        <Empty>
          Nothing to analyze yet. <a href={href("integrations")}>Add an agent</a> or scan this Mac.
        </Empty>
      ) : (
        <>
          {analysis.state.status === "loading" && <Loading what="blast radius" />}
          {analysis.state.status === "error" && (
            <ErrorState
              message={analysis.state.message}
              onRetry={() => runAnalysis(start, settings)}
            />
          )}
          {analysis.state.status === "success" && (
            <BlastRadiusResult
              result={analysis.state.data}
              onSimulate={simulate}
              simulation={simulation.state}
              onClearSimulation={resetSimulation}
              settings={settings}
              onSettings={setSettings}
            />
          )}
        </>
      )}
    </div>
  );
}

function BlastRadiusResult({
  result,
  onSimulate,
  simulation,
  onClearSimulation,
  settings,
  onSettings,
}: {
  result: BlastRadiusResponse;
  onSimulate: (changes: ChangeList) => void;
  simulation: AsyncState<SimulationResponse>;
  onClearSimulation: () => void;
  settings: AnalysisSettings;
  onSettings: (s: AnalysisSettings) => void;
}) {
  const ws = useWorkspace();
  const [expanded, setExpanded] = useState<string | null>(null);
  const impacts = [...result.impacts].sort(
    (a, b) =>
      SENSITIVITY_ORDER.indexOf(a.sensitivity) - SENSITIVITY_ORDER.indexOf(b.sensitivity) ||
      a.resourceId.localeCompare(b.resourceId),
  );
  const modifying = impacts.filter((i) => i.actions.some((a) => a.action !== "read")).length;
  const boundaries = new Set(result.boundaryCrossings.map((c) => c.toBoundaryId)).size;
  const findings = [...ws.findingsFor(result.startId)].sort((a, b) =>
    compareSeverity(a.severity, b.severity),
  );
  const name = ws.label(result.startId);
  const uncertain = result.uncertainty.inferredPaths + result.uncertainty.stalePaths;

  return (
    <>
      <section className="card summary-card" aria-label="Summary">
        <p className="summary-sentence">
          {impacts.length === 0 ? (
            <>
              With the collected data, <strong>{name}</strong> reaches no resources.
            </>
          ) : (
            <>
              If <strong>{name}</strong> were compromised, it could reach{" "}
              <strong>{plural(impacts.length, "resource")}</strong>
              {modifying > 0 && (
                <>
                  {" "}
                  and change or delete <strong>{modifying}</strong> of them
                </>
              )}
              {boundaries > 0 && <>, across {plural(boundaries, "other system")}</>}.
            </>
          )}
        </p>
        <p className="muted">
          This is potential reach, not confirmed exploitation.
          {uncertain > 0 && <> {plural(uncertain, "path")} rely on inferred or stale evidence.</>}
        </p>
        {result.truncated && (
          <p role="alert" className="warning">
            Analysis stopped early ({result.truncated.replace("_", " ")}). Results are incomplete.
          </p>
        )}
        {findings.length > 0 && (
          <p className="summary-findings">
            <SeverityBadge value={findings[0]!.severity} /> {plural(findings.length, "finding")} for{" "}
            {name}.{" "}
            <a href={href("remediation", { finding: findings[0]!.id })}>Review in Remediation</a>
          </p>
        )}
        <details className="disclosure">
          <summary>Assumption</summary>
          <p>{result.assumption}</p>
          <p className="muted">{result.disclaimer}</p>
        </details>
      </section>

      <section className="card card-flush" aria-labelledby="at-risk">
        <div className="card-head card-pad">
          <h3 id="at-risk">Resources at risk</h3>
        </div>
        {impacts.length === 0 ? (
          <div className="card-pad">
            <Empty>No resources are reachable under the current settings.</Empty>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Resource</th>
                  <th scope="col">Sensitivity</th>
                  <th scope="col">Could</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">
                    <span className="sr-only">Path</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {impacts.map((impact) => {
                  const open = expanded === impact.resourceId;
                  const pathIds = [
                    ...new Set(impact.actions.flatMap((a) => a.path.steps.map((s) => s.edgeId))),
                  ];
                  const evidence = impact.actions
                    .map((a) => a.path.assertion)
                    .reduce(weakerAssertion);
                  return (
                    <ImpactRow
                      key={impact.resourceId}
                      open={open}
                      onToggle={() => setExpanded(open ? null : impact.resourceId)}
                      label={ws.label(impact.resourceId)}
                      sensitivity={impact.sensitivity}
                      actions={impact.actions.map((a) => ACTION_VERBS[a.action]).join(", ")}
                      evidence={evidence}
                      graphHref={href("graph", {
                        focus: impact.resourceId,
                        path: pathIds.join(","),
                      })}
                    >
                      {impact.actions.map((a) => (
                        <div key={a.action}>
                          <p className="path-title">How it could {ACTION_VERBS[a.action]} this</p>
                          <PathExplanation
                            path={a.path}
                            onSimulateRemove={(edgeId) =>
                              onSimulate([{ kind: "remove_edge", edgeId }])
                            }
                          />
                        </div>
                      ))}
                    </ImpactRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SimulationPanel state={simulation} onClear={onClearSimulation} />

      <section className="card" aria-labelledby="reduce">
        <h3 id="reduce">Ways to reduce exposure</h3>
        <p className="card-sub">
          Each option was measured on an in-memory copy. Preview never changes anything.
        </p>
        {result.mitigations.length === 0 ? (
          <Empty>No single change reduces high-impact reach.</Empty>
        ) : (
          <ul className="mitigations">
            {result.mitigations.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.title}</strong>
                  <p className="muted">{m.rationale}</p>
                </div>
                <span
                  className="mitigation-effect"
                  title="Each is one action on one resource, measured on an in-memory copy"
                >
                  Removes {m.impactsRemoved} of {m.impactsRemoved + m.impactsRemaining} possible
                  actions
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onSimulate([m.change])}
                >
                  Preview
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card disclosure-card">
        <summary>Advanced analysis</summary>
        <AnalysisSettingsForm settings={settings} onChange={onSettings} />
        <GrantSimulator startId={result.startId} onSimulate={onSimulate} />
        {result.exfiltration.length > 0 && (
          <section>
            <h4>Possible data exfiltration</h4>
            <p className="muted">
              Readable data plus a component that can send it out. A hypothesis, not an observed
              transfer.
            </p>
            <ul>
              {result.exfiltration.map((x) => (
                <li key={`${x.resourceId}|${x.egressNodeId}`}>
                  {ws.label(x.resourceId)} could leave via {ws.label(x.egressNodeId)}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h4>Controls on these paths</h4>
          {result.controls.length === 0 ? (
            <p className="muted">No controls apply to anything reached.</p>
          ) : (
            <ul>
              {result.controls.map((c) => (
                <li key={`${c.policyId}|${c.governedNodeId}`}>
                  <EnforcementBadge value={c.enforcementState} /> <strong>{c.label}</strong> on{" "}
                  {ws.label(c.governedNodeId)}:{" "}
                  {c.limitsPropagation ? "limits reach" : "does not limit reach"}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h4>Relationships not followed ({result.uncertainty.excludedEdges.length})</h4>
          <ul>
            {result.uncertainty.excludedEdges.map((x) => {
              const edge = ws.edge(x.edgeId);
              return (
                <li key={`${x.edgeId}|${x.reason}`}>
                  {edge
                    ? `${ws.label(edge.from)} ${EDGE_SEMANTICS[edge.type].verb} ${ws.label(edge.to)}`
                    : x.edgeId}
                  : {EXCLUSION_TEXT[x.reason] ?? x.reason}
                </li>
              );
            })}
          </ul>
        </section>
      </details>
    </>
  );
}

function ImpactRow({
  open,
  onToggle,
  label,
  sensitivity,
  actions,
  evidence,
  graphHref,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  sensitivity: string;
  actions: string;
  evidence: BlastRadiusResponse["reached"][number]["path"]["assertion"];
  graphHref: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr>
        <th scope="row">{label}</th>
        <td>
          <span className={`sensitivity sensitivity-${sensitivity}`}>{sensitivity}</span>
        </td>
        <td>{actions}</td>
        <td>
          <AssertionBadge value={evidence} />
        </td>
        <td className="cell-actions">
          <button type="button" className="btn-link" aria-expanded={open} onClick={onToggle}>
            {open ? "Hide path" : "Show path"}
          </button>{" "}
          <a href={graphHref}>Open in graph</a>
        </td>
      </tr>
      {open && (
        <tr className="row-detail">
          <td colSpan={5}>{children}</td>
        </tr>
      )}
    </>
  );
}

function AnalysisSettingsForm({
  settings,
  onChange,
}: {
  settings: AnalysisSettings;
  onChange: (s: AnalysisSettings) => void;
}) {
  return (
    <form className="toolbar" onSubmit={(e) => e.preventDefault()} aria-label="Analysis settings">
      <label className="check">
        <input
          type="checkbox"
          checked={settings.includeInferred}
          onChange={(e) => onChange({ ...settings, includeInferred: e.target.checked })}
        />
        Follow inferred relationships
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.includeUnknown}
          onChange={(e) => onChange({ ...settings, includeUnknown: e.target.checked })}
        />
        Treat unknown as possible access
      </label>
      <label className="field-inline">
        <span>Max depth</span>
        <input
          type="number"
          min={1}
          max={25}
          value={settings.maxDepth}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 1 && v <= 25) onChange({ ...settings, maxDepth: v });
          }}
        />
      </label>
    </form>
  );
}

function AgentComparison() {
  const ws = useWorkspace();
  const { reach } = ws.data;
  const cell = new Map(reach.cells.map((c) => [`${c.agentId}|${c.resourceId}`, c]));
  if (reach.cells.length === 0)
    return (
      <Empty>
        No agent reaches a resource yet. <a href={href("integrations")}>Add an agent</a> AgentRadius
        can&apos;t detect.
      </Empty>
    );
  return (
    <section className="card card-flush" aria-label="Agent comparison">
      <div className="table-scroll matrix-scroll">
        <table className="table matrix">
          <thead>
            <tr>
              <th scope="col">Resource</th>
              {reach.agentIds.map((a) => (
                <th key={a} scope="col">
                  <a href={href("blast-radius", { start: a })}>{ws.label(a)}</a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reach.resourceIds.map((r) => (
              <tr key={r}>
                <th scope="row">{ws.label(r)}</th>
                {reach.agentIds.map((a) => {
                  const c = cell.get(`${a}|${r}`);
                  return (
                    <td key={a}>
                      {c ? (
                        <span className="reach-cell">
                          {c.actions.length > 0
                            ? c.actions.map((x) => ACTION_VERBS[x]).join(", ")
                            : "unknown actions"}
                          <AssertionBadge value={c.assertion} />
                        </span>
                      ) : (
                        <span className="muted" aria-label="No path">
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function describeChange(
  change: ChangeList[number],
  label: (id: string) => string,
  edgeLabel: (id: string) => string,
): string {
  switch (change.kind) {
    case "remove_edge":
      return `Removed relationship: ${edgeLabel(change.edgeId)}`;
    case "add_enforced_deny":
      return `Added a hypothetical verified deny control on ${label(change.nodeId)}`;
    case "add_edge":
      return `Added a hypothetical relationship: ${label(change.from)} ${EDGE_SEMANTICS[change.type].verb} ${label(change.to)}`;
  }
}

const GRANTABLE: readonly EdgeType[] = [
  "CONNECTS_TO",
  "AUTHENTICATES_WITH",
  "HOLDS_CREDENTIAL_REFERENCE",
  "GRANTS_SCOPE",
  "ASSUMES_ROLE",
  "DELEGATES_TO",
];

/** "What if this entity were also granted X?" — runs as an in-memory simulation only. */
function GrantSimulator({
  startId,
  onSimulate,
}: {
  startId: string;
  onSimulate: (changes: ChangeList) => void;
}) {
  const ws = useWorkspace();
  const [type, setType] = useState<EdgeType>("CONNECTS_TO");
  const targets = ws.data.nodes.filter(
    (n) => n.id !== startId && n.type !== "TrustBoundary" && n.type !== "Policy",
  );
  const [to, setTo] = useState(targets[0]?.id ?? "");
  return (
    <section>
      <h4>What if it were granted more?</h4>
      <form
        className="filters"
        aria-label="Simulate a grant"
        onSubmit={(e) => {
          e.preventDefault();
          if (to) onSimulate([{ kind: "add_edge", from: startId, type, to }]);
        }}
      >
        <span>{ws.label(startId)}</span>
        <label>
          <span className="sr-only">Relationship</span>
          <select value={type} onChange={(e) => setType(e.target.value as EdgeType)}>
            {GRANTABLE.map((t) => (
              <option key={t} value={t}>
                {EDGE_SEMANTICS[t].verb}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Target</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {targets.map((n) => (
              <option key={n.id} value={n.id}>
                {n.type}: {n.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Simulate grant</button>
      </form>
    </section>
  );
}

function SimulationPanel({
  state,
  onClear,
}: {
  state: AsyncState<SimulationResponse>;
  onClear: () => void;
}) {
  const ws = useWorkspace();
  if (state.status === "idle") return null;
  return (
    <section className="card simulation" aria-live="polite" aria-label="Simulation result">
      <div className="card-head">
        <h3>Preview result</h3>
        <button type="button" className="btn-secondary" onClick={onClear}>
          Close
        </button>
      </div>
      {state.status === "loading" && <Loading what="simulation" />}
      {state.status === "error" && <ErrorState message={state.message} />}
      {state.status === "success" && (
        <>
          <p className="notice-text">{state.data.notice}</p>
          <ul>
            {state.data.outcomes.map((o, i) => (
              <li key={i}>
                {describeChange(o.change, ws.label, (id) => {
                  const e = ws.edge(id);
                  return e ? `${ws.label(e.from)} → ${ws.label(e.to)} (${e.type})` : id;
                })}
                {!o.applied && <span className="warning"> — not applied: {o.reason}</span>}
              </li>
            ))}
          </ul>
          <dl className="facts facts-inline">
            <div>
              <dt>Impacts removed</dt>
              <dd>{state.data.impactsRemoved.length}</dd>
            </div>
            <div>
              <dt>Impacts remaining</dt>
              <dd>{state.data.impactsRemaining.length}</dd>
            </div>
            <div>
              <dt>No longer reachable</dt>
              <dd>{state.data.reachabilityRemoved.length}</dd>
            </div>
          </dl>
          {state.data.impactsRemoved.length > 0 && (
            <ul>
              {state.data.impactsRemoved.map((k) => (
                <li key={`${k.resourceId}|${k.action}`}>
                  No longer able to <strong>{k.action}</strong> {ws.label(k.resourceId)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
