import { useMemo, useState } from "react";
import {
  ASSERTIONS,
  EDGE_SEMANTICS,
  NODE_TYPES,
  type Assertion,
  type NodeType,
} from "../../domain/core.ts";
import { AssertionBadge, ConfidenceBadge } from "../components/Badges.tsx";
import { RemediateCta } from "../components/RemediateCta.tsx";
import { ScanButton } from "../components/SourceControls.tsx";
import { Empty } from "../components/States.tsx";
import { EntityPanel } from "../graph/EntityPanel.tsx";
import { GraphCanvas, type Selection } from "../graph/GraphCanvas.tsx";
import { PermissionsView } from "../graph/PermissionsView.tsx";
import { ACTION_VERBS, plural, TYPE_LABELS, TYPE_MEANINGS } from "../labels.ts";
import { href } from "../routing.ts";
import { useWorkspace } from "../workspace.tsx";

const HIDDEN_BY_DEFAULT: ReadonlySet<NodeType> = new Set(["TrustBoundary"]);
const VIEWS = [
  { id: "graph", label: "Graph" },
  { id: "relationships", label: "Relationships" },
  { id: "permissions", label: "Direct permissions" },
] as const;
type View = (typeof VIEWS)[number]["id"];

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function GraphPage(props: {
  focusId: string | null;
  justScanned?: boolean;
  pathEdgeIds?: readonly string[];
  view?: string | null;
  sourceId?: string | null;
}) {
  const ws = useWorkspace();
  if (ws.data.nodes.length === 0)
    return (
      <div className="page">
        <header className="page-header">
          <h2>Permission Graph</h2>
          <p className="muted">
            Who has access, what they can reach, and how that access connects.
          </p>
        </header>
        <section className="card empty-hero">
          <h3>Nothing to map yet</h3>
          <p className="muted">
            {props.justScanned
              ? "The scan found no MCP servers in the supported clients on this computer. Add the agents you use in other apps to map them."
              : "Connect a supported account, track an in-app agent, or scan this computer."}
          </p>
          <div className="scan-actions">
            <a className="btn-secondary" href={href("integrations")}>
              Add agents
            </a>
            <ScanButton />
          </div>
        </section>
      </div>
    );
  return <MapView {...props} />;
}

function MapView({
  focusId,
  justScanned = false,
  pathEdgeIds = [],
  view: initialView = null,
  sourceId = null,
}: {
  focusId: string | null;
  justScanned?: boolean;
  pathEdgeIds?: readonly string[];
  view?: string | null;
  sourceId?: string | null;
}) {
  const ws = useWorkspace();
  const presentTypes = useMemo(
    () => NODE_TYPES.filter((t) => ws.data.nodes.some((n) => n.type === t)),
    [ws.data.nodes],
  );
  const sources = useMemo(
    () =>
      [...new Map(ws.data.connectorRuns.map((r) => [r.connectorId, r.label])).entries()].sort(
        ([, a], [, b]) => a.localeCompare(b),
      ),
    [ws.data.connectorRuns],
  );
  const [view, setView] = useState<View>(
    VIEWS.some((v) => v.id === initialView) ? (initialView as View) : "graph",
  );
  const [types, setTypes] = useState<ReadonlySet<NodeType>>(
    () => new Set(presentTypes.filter((t) => !HIDDEN_BY_DEFAULT.has(t))),
  );
  const [assertions, setAssertions] = useState<ReadonlySet<Assertion>>(() => new Set(ASSERTIONS));
  const [source, setSource] = useState(sourceId ?? "");
  const [withFindings, setWithFindings] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);
  const [query, setQuery] = useState("");
  const [path, setPath] = useState<ReadonlySet<string>>(
    () => new Set(pathEdgeIds.filter((id) => ws.edge(id))),
  );
  const [selection, setSelection] = useState<Selection | null>(() =>
    focusId && ws.node(focusId) ? { kind: "node", id: focusId } : null,
  );

  const pathNodeIds = useMemo(
    () =>
      new Set([...path].flatMap((id) => (ws.edge(id) ? [ws.edge(id)!.from, ws.edge(id)!.to] : []))),
    [path, ws],
  );

  const nodes = useMemo(
    () =>
      ws.data.nodes.filter(
        (n) =>
          pathNodeIds.has(n.id) ||
          (types.has(n.type) &&
            (source === "" || n.provenance.some((p) => p.connectorId === source)) &&
            (!withFindings || ws.findingsFor(n.id).length > 0)),
      ),
    [ws, types, source, withFindings, pathNodeIds],
  );
  const visibleIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(
    () =>
      ws.data.edges.filter(
        (e) =>
          path.has(e.id) ||
          (visibleIds.has(e.from) &&
            visibleIds.has(e.to) &&
            assertions.has(e.assertion) &&
            (showRevoked || e.lifecycle !== "revoked")),
      ),
    [ws.data.edges, visibleIds, assertions, showRevoked, path],
  );

  const emphasis = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q !== "") {
      const ids = new Set(
        nodes.filter((n) => `${n.label} ${n.id}`.toLowerCase().includes(q)).map((n) => n.id),
      );
      return { nodeIds: ids, edgeIds: new Set<string>() };
    }
    if (selection?.kind === "node") {
      const touching = edges.filter((e) => e.from === selection.id || e.to === selection.id);
      return {
        nodeIds: new Set([selection.id, ...touching.flatMap((e) => [e.from, e.to])]),
        edgeIds: new Set(touching.map((e) => e.id)),
      };
    }
    if (selection?.kind === "edge") {
      const edge = ws.edge(selection.id);
      return edge ? { nodeIds: new Set([edge.from, edge.to]), edgeIds: new Set([edge.id]) } : null;
    }
    if (path.size > 0) return { nodeIds: pathNodeIds, edgeIds: new Set(path) };
    return null;
  }, [query, nodes, edges, selection, ws, path, pathNodeIds]);

  const findingCounts = useMemo(
    () => new Map(nodes.map((n) => [n.id, ws.findingsFor(n.id).length])),
    [nodes, ws],
  );
  const staleIds = useMemo(() => new Set(ws.data.staleIds), [ws.data.staleIds]);

  return (
    <div className="page graph-page">
      <header className="page-header">
        <h2>Permission Graph</h2>
        <p className="muted">Who has access, what they can reach, and how that access connects.</p>
      </header>

      {justScanned && (
        <div className="scan-done" role="status">
          <strong>Scan complete.</strong> Mapped{" "}
          {plural(ws.data.nodes.filter((n) => n.type !== "TrustBoundary").length, "item")} from what
          was found and added. Blast radius and findings are below.
        </div>
      )}

      <ol className="read-guide" aria-label="How to read this map">
        <li>
          <i className="legend-swatch node-swatch-Agent" aria-hidden="true" />
          <strong>Agents &amp; apps</strong>
          <span>who acts</span>
        </li>
        <li>
          <i className="legend-swatch node-swatch-MCPServer" aria-hidden="true" />
          <strong>Servers &amp; tools</strong>
          <span>what they connect to</span>
        </li>
        <li>
          <i className="legend-swatch node-swatch-CredentialReference" aria-hidden="true" />
          <strong>Credentials &amp; grants</strong>
          <span>the access they carry</span>
        </li>
        <li>
          <i className="legend-swatch node-swatch-Resource" aria-hidden="true" />
          <strong>Your data</strong>
          <span>what could be affected</span>
        </li>
        <li className="read-guide-tip">
          Access flows left to right. Click any box to see where its access comes from.
        </li>
      </ol>

      <div className="tabs" role="tablist" aria-label="View">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className="tab"
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "permissions" ? (
        <PermissionsView />
      ) : (
        <>
          {path.size > 0 && (
            <div className="path-banner" role="status">
              Highlighting the evidence path for a finding ({path.size} step
              {path.size === 1 ? "" : "s"}).
              <button type="button" className="btn-link" onClick={() => setPath(new Set())}>
                Clear
              </button>
            </div>
          )}
          <div className="toolbar" role="group" aria-label="Graph filters">
            <label className="search">
              <span className="sr-only">Search</span>
              <input
                type="search"
                placeholder="Search agents, apps, resources…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  const first = emphasis?.nodeIds.values().next().value;
                  if (e.key === "Enter" && query && first)
                    setSelection({ kind: "node", id: first });
                }}
              />
            </label>
            <label className="field-inline">
              <span>Source</span>
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">All sources</option>
                {sources.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={withFindings}
                onChange={() => setWithFindings(!withFindings)}
              />
              Has findings
            </label>
            <details className="filter-menu">
              <summary>More filters</summary>
              <div className="filter-menu-body">
                <fieldset>
                  <legend>Show</legend>
                  {presentTypes.map((t) => (
                    <label key={t} className="check">
                      <input
                        type="checkbox"
                        checked={types.has(t)}
                        onChange={() => setTypes(toggle(types, t))}
                      />
                      {TYPE_LABELS[t]}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>Evidence</legend>
                  {ASSERTIONS.map((a) => (
                    <label key={a} className="check">
                      <input
                        type="checkbox"
                        checked={assertions.has(a)}
                        onChange={() => setAssertions(toggle(assertions, a))}
                        aria-label={a}
                      />
                      <AssertionBadge value={a} />
                    </label>
                  ))}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={showRevoked}
                      onChange={() => setShowRevoked(!showRevoked)}
                    />
                    Revoked
                  </label>
                </fieldset>
              </div>
            </details>
            <span className="muted toolbar-count">
              {nodes.length} items · {edges.length} links
            </span>
          </div>
          <div className="graph-layout">
            {nodes.length === 0 ? (
              <Empty>Nothing matches these filters.</Empty>
            ) : view === "graph" ? (
              <GraphCanvas
                title="Permission graph"
                nodes={nodes}
                edges={edges}
                selection={selection}
                onSelect={setSelection}
                emphasis={emphasis}
                staleIds={staleIds}
                findingCounts={findingCounts}
              />
            ) : (
              <RelationshipTable edges={edges} selection={selection} onSelect={setSelection} />
            )}
            <EntityPanel selection={selection} onSelect={setSelection} />
          </div>
          {view === "graph" && <Legend types={presentTypes.filter((t) => types.has(t))} />}
        </>
      )}

      <ReachPanel selectedId={selection?.kind === "node" ? selection.id : null} />
      <RemediateCta />
    </div>
  );
}

const REACH_LIMIT = 6;

/** Blast radius at a glance, from the reach summary the workspace already computed. */
function ReachPanel({ selectedId }: { selectedId: string | null }) {
  const ws = useWorkspace();
  const { reach } = ws.data;
  const byAgent = useMemo(() => {
    const m = new Map<string, (typeof reach.cells)[number][]>();
    for (const c of reach.cells) m.set(c.agentId, [...(m.get(c.agentId) ?? []), c]);
    return m;
  }, [reach.cells]);
  const widest = [...reach.agentIds].sort(
    (a, b) => (byAgent.get(b)?.length ?? 0) - (byAgent.get(a)?.length ?? 0) || a.localeCompare(b),
  )[0];
  const [picked, setPicked] = useState<string | null>(null);
  const agentId =
    (selectedId && reach.agentIds.includes(selectedId) ? selectedId : null) ?? picked ?? widest;
  if (agentId === undefined) return null;
  const cells = byAgent.get(agentId) ?? [];
  const modifying = cells.filter((c) => c.actions.some((a) => a !== "read")).length;
  const name = ws.label(agentId);

  return (
    <section className="card reach-panel" aria-labelledby="reach-title">
      <div className="card-head">
        <h3 id="reach-title">Blast radius</h3>
        <a href={href("blast-radius", { start: agentId })}>Full analysis for {name} →</a>
      </div>
      {reach.agentIds.length > 1 && (
        <div className="chip-row" role="group" aria-label="Agent">
          {reach.agentIds.map((id) => (
            <button
              key={id}
              type="button"
              className="chip"
              aria-pressed={id === agentId}
              onClick={() => setPicked(id)}
            >
              {ws.label(id)}
              <span className="chip-count">{byAgent.get(id)?.length ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      <p className="summary-sentence">
        {cells.length === 0 ? (
          <>
            With the collected data, <strong>{name}</strong> reaches none of your data.
          </>
        ) : (
          <>
            If <strong>{name}</strong> were compromised, it could reach{" "}
            <strong>{plural(cells.length, "resource")}</strong>
            {modifying > 0 && (
              <>
                {" "}
                and change <strong>{modifying}</strong> of them
              </>
            )}
            .
          </>
        )}
      </p>
      {cells.length > 0 && (
        <ul className="reach-list">
          {cells.slice(0, REACH_LIMIT).map((c) => (
            <li key={c.resourceId}>
              <a href={href("graph", { focus: c.resourceId })}>{ws.label(c.resourceId)}</a>
              <span className="muted">
                {c.actions.length > 0
                  ? c.actions.map((a) => ACTION_VERBS[a]).join(", ")
                  : "unknown actions"}
              </span>
              <AssertionBadge value={c.assertion} />
            </li>
          ))}
        </ul>
      )}
      {cells.length > REACH_LIMIT && (
        <p className="muted small">
          And {cells.length - REACH_LIMIT} more on the{" "}
          <a href={href("blast-radius", { start: agentId })}>Blast Radius</a> page.
        </p>
      )}
      <p className="muted small">Potential reach, not confirmed exploitation.</p>
    </section>
  );
}

function RelationshipTable({
  edges,
  selection,
  onSelect,
}: {
  edges: readonly ReturnType<typeof useWorkspace>["data"]["edges"][number][];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}) {
  const ws = useWorkspace();
  return (
    <div className="card card-flush table-scroll">
      <table className="table">
        <caption className="sr-only">Relationships</caption>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">Relationship</th>
            <th scope="col">To</th>
            <th scope="col">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((e) => (
            <tr key={e.id} className={selection?.id === e.id ? "is-selected" : ""}>
              <td>
                <button
                  type="button"
                  className="link"
                  onClick={() => onSelect({ kind: "node", id: e.from })}
                >
                  {ws.label(e.from)}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  className="link"
                  onClick={() => onSelect({ kind: "edge", id: e.id })}
                >
                  {EDGE_SEMANTICS[e.type].verb}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  className="link"
                  onClick={() => onSelect({ kind: "node", id: e.to })}
                >
                  {ws.label(e.to)}
                </button>
              </td>
              <td>
                <AssertionBadge value={e.assertion} /> <ConfidenceBadge value={e.confidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Legend({ types }: { types: readonly NodeType[] }) {
  return (
    <details className="legend-panel" open>
      <summary>Legend</summary>
      <div className="legend">
        {types
          .filter((t) => TYPE_MEANINGS[t])
          .map((t) => (
            <span key={t} title={TYPE_MEANINGS[t]}>
              <i className={`legend-swatch node-swatch-${t}`} aria-hidden="true" />
              <strong>{TYPE_LABELS[t]}</strong>
              <span className="muted">{TYPE_MEANINGS[t]}</span>
            </span>
          ))}
      </div>
      <div className="legend">
        {(["observed", "declared", "inferred", "unknown"] as const).map((a) => (
          <span key={a}>
            <svg width="32" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="32" y2="4" className={`legend-line edge-${a}`} />
            </svg>
            {a === "unknown" ? "unknown (not counted as access)" : a}
          </span>
        ))}
        <span>⧗ stale evidence</span>
        <span>⚑ has findings</span>
        <a href={href("blast-radius")}>What could this access affect?</a>
      </div>
    </details>
  );
}
