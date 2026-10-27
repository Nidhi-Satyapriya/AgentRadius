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
import { RemediateCta } from "../components/RemediateCta.tsx";
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
  const ranking = useMemo(() => rankAgents(ws.data.reach), [ws.data.reach]);
  const [start, setStart] = useState(
    () =>
      (startId && ws.node(startId) ? startId : null) ??
      ranking[0]?.agentId ??
      candidates[0]?.id ??
      "",
  );
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
    if (start === "") return;
    runAnalysis(start, settings);
    resetSimulation();
  }, [start, settings, runAnalysis, resetSimulation]);

  const simulate = (changes: ChangeList) => simulation.run(start, changes, settings);

  return (
    <div className="page">
      <header className="page-header">
        <h2>Blast Radius</h2>
        <p className="muted">
          Pick an agent and see what someone could reach if they took it over.
        </p>
      </header>
      {candidates.length === 0 ? (
        <Empty>
          Nothing to analyze yet. <a href={href("integrations")}>Add an agent</a> or scan this
          computer.
        </Empty>
      ) : (
        <>
          {ranking.length > 0 && (
            <section aria-labelledby="ranked-title">
              <h3 id="ranked-title" className="section-title">
                Riskiest agents first
              </h3>
              <ul className="agent-rank">
                {ranking.map((r, i) => (
                  <li key={r.agentId}>
                    <button
                      type="button"
                      className="rank-card"
                      aria-pressed={r.agentId === start}
                      onClick={() => setStart(r.agentId)}
                    >
                      <span className="rank-num" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span className="rank-text">
                        <strong>{ws.label(r.agentId)}</strong>
                        <span className="muted">
                          {r.resources === 0
                            ? "Reaches nothing we can see"
                            : `${plural(r.resources, "resource")} · ${r.changeable} it could change`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="toolbar">
            <label className="field-inline">
              <span>Or pick anything</span>
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
          </div>
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
          <RemediateCta />
        </>
      )}
    </div>
  );
}

function rankAgents(reach: WorkspaceResponse["reach"]) {
  return reach.agentIds
    .map((agentId) => {
      const cells = reach.cells.filter((c) => c.agentId === agentId);
      return {
        agentId,
        resources: cells.length,
        changeable: cells.filter((c) => c.actions.some((a) => a !== "read")).length,
      };
    })
    .sort(
      (a, b) =>
        b.changeable - a.changeable ||
        b.resources - a.resources ||
        a.agentId.localeCompare(b.agentId),
    );
}

type Impact = BlastRadiusResponse["impacts"][number];

const BOXES = [
  {
    id: "run",
    title: "Can delete, run, or administer",
    note: "The most serious: data loss or running code as you.",
    actions: ["delete", "execute", "admin"],
  },
  {
    id: "change",
    title: "Can change",
    note: "Could edit, post, or create things.",
    actions: ["write"],
  },
  { id: "read", title: "Can read", note: "Could see or copy this data.", actions: ["read"] },
] as const;

/** Each resource goes in the box of the strongest thing that could be done to it. */
function boxOf(impact: Impact): (typeof BOXES)[number]["id"] | null {
  const actions = impact.actions.map((a) => a.action);
  for (const box of BOXES)
    if (actions.some((a) => (box.actions as readonly string[]).includes(a))) return box.id;
  return null;
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
  const [open, setOpen] = useState<string | null>(null);
  const impacts = [...result.impacts].sort(
    (a, b) =>
      SENSITIVITY_ORDER.indexOf(a.sensitivity) - SENSITIVITY_ORDER.indexOf(b.sensitivity) ||
      a.resourceId.localeCompare(b.resourceId),
  );
  const unknownReach = result.reached.filter(
    (r) => r.nodeType === "Resource" && !impacts.some((i) => i.resourceId === r.nodeId),
  );
  const changeable = impacts.filter((i) => i.actions.some((a) => a.action !== "read")).length;
  const findings = [...ws.findingsFor(result.startId)].sort((a, b) =>
    compareSeverity(a.severity, b.severity),
  );
  const name = ws.label(result.startId);
  const fixes = result.mitigations.slice(0, 3);

  return (
    <>
      <section className="card br-hero" aria-label="Summary">
        <p className="summary-sentence">
          {impacts.length === 0 ? (
            <>
              With what AgentRadius can see, <strong>{name}</strong> reaches none of your data.
            </>
          ) : (
            <>
              If <strong>{name}</strong> were compromised, it could reach{" "}
              <strong>{plural(impacts.length, "resource")}</strong>
              {changeable > 0 && (
                <>
                  {" "}
                  and change <strong>{changeable}</strong> of them
                </>
              )}
              .
            </>
          )}
        </p>
        <p className="muted">{result.disclaimer}</p>
        {findings.length > 0 && (
          <p className="summary-findings">
            <SeverityBadge value={findings[0]!.severity} /> {findings[0]!.title}{" "}
            <a href={href("remediation", { finding: findings[0]!.id })}>Fix it</a>
          </p>
        )}
        {result.truncated && (
          <p role="alert" className="warning">
            The analysis stopped early, so this list is incomplete.
          </p>
        )}
      </section>

      {impacts.length === 0 ? (
        <section className="card" aria-label="Why nothing shows">
          <h3>Why nothing shows</h3>
          <ul className="plain-list">
            {unknownReach.length > 0 && (
              <li>
                It connects to {unknownReach.map((r) => ws.label(r.nodeId)).join(", ")}, but what it
                can do there isn&apos;t known.
              </li>
            )}
            <li>
              AgentRadius sees what is configured on this computer, not what each server or account
              allows. Servers it doesn&apos;t recognize show no reach.
            </li>
            {result.uncertainty.excludedEdges.length > 0 && (
              <li>
                {plural(result.uncertainty.excludedEdges.length, "relationship")} weren&apos;t
                followed because the evidence is too weak. You can include them under Advanced.
              </li>
            )}
          </ul>
        </section>
      ) : (
        <section aria-labelledby="at-risk">
          <h3 id="at-risk" className="section-title">
            Resources at risk
          </h3>
          <div className="br-boxes">
            {BOXES.map((box) => {
              const items = impacts.filter((i) => boxOf(i) === box.id);
              return (
                <section key={box.id} className={`br-box br-box-${box.id}`} aria-label={box.title}>
                  <header>
                    <h4>{box.title}</h4>
                    <span className="br-count">{items.length}</span>
                  </header>
                  <p className="muted small">{box.note}</p>
                  {items.length === 0 ? (
                    <p className="muted small">Nothing here.</p>
                  ) : (
                    <ul>
                      {items.map((impact) => (
                        <ImpactCard
                          key={impact.resourceId}
                          impact={impact}
                          open={open === impact.resourceId}
                          onToggle={() =>
                            setOpen(open === impact.resourceId ? null : impact.resourceId)
                          }
                          onSimulate={onSimulate}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      )}

      <SimulationPanel state={simulation} onClear={onClearSimulation} />

      {fixes.length > 0 && (
        <section aria-labelledby="fix-first">
          <h3 id="fix-first" className="section-title">
            Fix these first
          </h3>
          <ul className="fix-cards">
            {fixes.map((m) => (
              <li key={m.id} className="fix-card">
                <strong>{m.title}</strong>
                <span className="muted small">{m.rationale}</span>
                <span className="fix-effect">
                  Removes {m.impactsRemoved} of {m.impactsRemoved + m.impactsRemaining} ways in
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
        </section>
      )}

      <details className="card disclosure-card">
        <summary>Advanced</summary>
        <p className="muted">{result.assumption}</p>
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

function ImpactCard({
  impact,
  open,
  onToggle,
  onSimulate,
}: {
  impact: Impact;
  open: boolean;
  onToggle: () => void;
  onSimulate: (changes: ChangeList) => void;
}) {
  const ws = useWorkspace();
  const first = impact.actions[0]!;
  const pathIds = [...new Set(impact.actions.flatMap((a) => a.path.steps.map((s) => s.edgeId)))];
  const evidence = impact.actions.map((a) => a.path.assertion).reduce(weakerAssertion);
  const chain = [first.path.steps[0]?.fromId, ...first.path.steps.map((s) => s.toId)].filter(
    (id): id is string => id !== undefined,
  );
  return (
    <li className="impact-card">
      <div className="impact-head">
        <strong>{ws.label(impact.resourceId)}</strong>
        {impact.sensitivity !== "unclassified" && (
          <span className={`sensitivity sensitivity-${impact.sensitivity}`}>
            {impact.sensitivity}
          </span>
        )}
      </div>
      <span className="muted small">
        Could {impact.actions.map((a) => ACTION_VERBS[a.action]).join(", ")}{" "}
        <AssertionBadge value={evidence} />
      </span>
      <ol className="chain" aria-label="How it gets there">
        {chain.map((id) => (
          <li key={id}>{ws.label(id)}</li>
        ))}
      </ol>
      <div className="impact-actions">
        <button type="button" className="btn-link" aria-expanded={open} onClick={onToggle}>
          {open ? "Hide details" : "Details"}
        </button>
        <a href={href("graph", { focus: impact.resourceId, path: pathIds.join(",") })}>
          Show in graph
        </a>
      </div>
      {open &&
        impact.actions.map((a) => (
          <div key={a.action}>
            <p className="path-title">How it could {ACTION_VERBS[a.action]} this</p>
            <PathExplanation
              path={a.path}
              onSimulateRemove={(edgeId) => onSimulate([{ kind: "remove_edge", edgeId }])}
            />
          </div>
        ))}
    </li>
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
