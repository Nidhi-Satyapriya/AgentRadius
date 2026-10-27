import { useCallback, useMemo, useState } from "react";
import {
  ACCESS_LABELS,
  AGENT_PRESETS,
  catalogApp,
  DECLARED_CONNECTOR_ID,
  RUNTIME_LABELS,
} from "../../domain/core.ts";
import { api } from "../api.ts";
import { SeverityBadge } from "../components/Badges.tsx";
import { DeclareAgentForm } from "../components/DeclareAgentForm.tsx";
import {
  SCAN_DISCLOSURE,
  ScanButton,
  timeAgo,
  useWorkspaceChange,
} from "../components/SourceControls.tsx";
import { Empty } from "../components/States.tsx";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  ERROR_NEXT_STEP,
  integrationRows,
  monogram,
  type Category,
  type IntegrationRow,
} from "../integrations.ts";
import { plural } from "../labels.ts";
import { href } from "../routing.ts";
import { useWorkspace } from "../workspace.tsx";

const CUSTOM = "custom";

export function IntegrationsPage({ selectedId }: { selectedId: string | null }) {
  const ws = useWorkspace();
  const rows = useMemo(() => integrationRows(ws), [ws]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [adding, setAdding] = useState<string | null>(null);
  const closeForm = useCallback(() => setAdding(null), []);
  const present = CATEGORIES.filter((c) => rows.some((r) => r.category === c));
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) => (category === "all" || r.category === category) && r.name.toLowerCase().includes(q),
  );
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const addedNames = new Set(ws.data.declaredAgents.map((a) => a.name));
  const agentsAdded = ws.data.declaredAgents.length;
  const scanned = ws.data.scannedAt !== null;
  const scannedSources = ws.data.connectorRuns.filter(
    (r) => r.connectorId !== DECLARED_CONNECTOR_ID,
  ).length;

  return (
    <div className="page">
      <header className="page-header">
        <h2>Integrate your setup</h2>
        <p className="muted">
          Add the AI agents you use, then scan this computer. Only what you add or scan shows up
          here. Local sources read files on this computer only and change nothing.
        </p>
      </header>

      <ol className="setup-steps" aria-label="Setup steps">
        <li className={agentsAdded > 0 ? "is-done" : "is-current"}>
          <span className="step-num" aria-hidden="true">
            1
          </span>
          <div>
            <strong>Add your agents</strong>
            <span className="muted">
              {agentsAdded > 0 ? `${plural(agentsAdded, "agent")} added` : "Pick from the list"}
            </span>
          </div>
        </li>
        <li className={scanned ? "is-done" : agentsAdded > 0 ? "is-current" : ""}>
          <span className="step-num" aria-hidden="true">
            2
          </span>
          <div>
            <strong>Scan this computer</strong>
            <span className="muted">
              {scanned ? `Scanned ${timeAgo(ws.data.scannedAt!)}` : "Finds MCP servers"}
            </span>
          </div>
        </li>
        <li className={scanned ? "is-current" : ""}>
          <span className="step-num" aria-hidden="true">
            3
          </span>
          <div>
            <strong>See your map</strong>
            <span className="muted">
              {scanned || agentsAdded > 0 ? (
                <a href={href("graph")}>Open the Permission Graph</a>
              ) : (
                "Opens after the scan"
              )}
            </span>
          </div>
        </li>
      </ol>

      <div className="integrate-grid">
        <section className="card" aria-labelledby="catalog-title">
          <div className="card-head">
            <h3 id="catalog-title">Add agents one by one</h3>
          </div>
          <p className="muted">
            For assistants that live inside apps, which a scan of this computer can&apos;t see.
            Choose one, confirm what it can reach, and add it.
          </p>
          {ws.replace && adding !== null ? (
            <DeclareAgentForm
              key={adding}
              onClose={closeForm}
              {...(adding !== CUSTOM ? { initialPresetId: adding } : {})}
            />
          ) : (
            <ul className="agent-catalog">
              {AGENT_PRESETS.map((p) => {
                const added = addedNames.has(p.label);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`agent-tile ${added ? "is-added" : ""}`}
                      onClick={() => setAdding(p.id)}
                      disabled={!ws.replace}
                      aria-label={added ? `${p.label} (added)` : `Add ${p.label}`}
                    >
                      <span className="app-icon" aria-hidden="true">
                        {monogram(p.label)}
                      </span>
                      <span className="agent-tile-text">
                        <strong>{p.label}</strong>
                        <span className="muted">
                          {p.appIds.map((id) => catalogApp(id)?.label ?? id).join(", ")}
                        </span>
                      </span>
                      <span className="agent-tile-action" aria-hidden="true">
                        {added ? "✓ Added" : "+ Add"}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  className="agent-tile is-custom"
                  onClick={() => setAdding(CUSTOM)}
                  disabled={!ws.replace}
                >
                  <span className="app-icon" aria-hidden="true">
                    +
                  </span>
                  <span className="agent-tile-text">
                    <strong>Custom agent</strong>
                    <span className="muted">Name it and choose its apps</span>
                  </span>
                </button>
              </li>
            </ul>
          )}
        </section>

        <section className="card scan-card" aria-labelledby="scan-title">
          <span className="scan-visual" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <h3 id="scan-title">{scanned ? "This computer is mapped" : "Scan this computer"}</h3>
          <p className="muted">{SCAN_DISCLOSURE}</p>
          <div className="scan-actions">
            <ScanButton />
          </div>
          {scanned && (
            <p className="small muted">
              {plural(scannedSources, "source")} read {timeAgo(ws.data.scannedAt!)}.{" "}
              <a href={href("graph")}>Open the map</a>
            </p>
          )}
        </section>
      </div>

      <h3 className="section-title">Your integrations</h3>
      {rows.length === 0 ? (
        <div className="card">
          <Empty>
            Nothing added yet. Add an agent or scan this computer. AgentRadius shows no sample data.
          </Empty>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="search">
              <span className="sr-only">Search integrations</span>
              <input
                type="search"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="segmented" role="radiogroup" aria-label="Category">
              {(["all", ...present] as const).map((c) => (
                <label key={c}>
                  <input
                    type="radio"
                    name="integration-category"
                    checked={category === c}
                    onChange={() => setCategory(c)}
                  />
                  {c === "all" ? "All" : CATEGORY_LABELS[c]}
                </label>
              ))}
            </div>
          </div>

          <div className={`split ${selected ? "has-panel" : ""}`}>
            <div className="card card-flush">
              {visible.length === 0 ? (
                <Empty>No integrations match.</Empty>
              ) : (
                <div className="table-scroll">
                  <table className="table table-rows">
                    <caption className="sr-only">Integrations</caption>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Status</th>
                        <th scope="col">Access method</th>
                        <th scope="col">Last synced</th>
                        <th scope="col">Found</th>
                        <th scope="col">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.id} className={r.id === selectedId ? "is-selected" : ""}>
                          <th scope="row">
                            <a
                              className="row-link"
                              href={href("integrations", { source: r.id })}
                              aria-current={r.id === selectedId ? "true" : undefined}
                            >
                              <span className="app-icon" aria-hidden="true">
                                {monogram(r.name)}
                              </span>
                              <span>
                                {r.name}
                                <span className="row-sub">{CATEGORY_LABELS[r.category]}</span>
                              </span>
                            </a>
                          </th>
                          <td>
                            <StatusPill status={r.status} />
                          </td>
                          <td>{r.auth}</td>
                          <td>{r.lastSync ? timeAgo(r.lastSync) : "—"}</td>
                          <td>{r.found ?? "—"}</td>
                          <td>{r.risk ? <SeverityBadge value={r.risk} /> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {selected && <IntegrationPanel row={selected} />}
          </div>
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: IntegrationRow["status"] }) {
  return (
    <span className={`status-pill tone-${status.tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {status.label}
    </span>
  );
}

function IntegrationPanel({ row }: { row: IntegrationRow }) {
  return (
    <aside className="detail-panel" aria-label={`${row.name} details`}>
      <div className="panel-head">
        <span className="app-icon app-icon-lg" aria-hidden="true">
          {monogram(row.name)}
        </span>
        <div>
          <h3>{row.name}</h3>
          <StatusPill status={row.status} />
        </div>
        <a className="panel-close" href={href("integrations")} aria-label="Close details">
          ×
        </a>
      </div>
      {row.kind === "source" && <SourceDetails row={row} />}
      {row.kind === "declared" && <DeclaredDetails row={row} />}
    </aside>
  );
}

function SourceDetails({ row }: { row: Extract<IntegrationRow, { kind: "source" }> }) {
  const { run } = row;
  const sections: [string, readonly string[]][] = [
    ["Reads", run.dataCategories],
    ["Access it needs", run.requiredPrivileges],
    ["Can't see", run.blindSpots],
  ];
  return (
    <>
      <p>{run.coverage}</p>
      {run.errors.length > 0 && (
        <div className="panel-alert" role="alert">
          <strong>{run.errors.length === 1 ? "1 problem" : `${run.errors.length} problems`}</strong>
          <ul>
            {run.errors.map((e) => (
              <li key={`${e.code}|${e.message}`}>
                {e.message} {ERROR_NEXT_STEP[e.code] ?? ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="panel-actions">
        {row.category === "local" && <ScanButton className="btn-secondary" />}
        {row.found !== null && row.found > 0 && (
          <a className="btn-secondary" href={href("graph", { source: run.connectorId })}>
            View permissions
          </a>
        )}
      </div>
      <dl className="facts">
        <div>
          <dt>Access method</dt>
          <dd>{row.auth}, read-only</dd>
        </div>
        <div>
          <dt>Last synced</dt>
          <dd>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "Never"}</dd>
        </div>
      </dl>
      {sections
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <details key={title} className="disclosure">
            <summary>
              {title} ({items.length})
            </summary>
            <ul>
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </details>
        ))}
    </>
  );
}

function DeclaredDetails({ row }: { row: Extract<IntegrationRow, { kind: "declared" }> }) {
  const { agent } = row;
  const remove = useWorkspaceChange(api.removeAgent);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <p className="muted">You entered this agent. Its access in each app is not verified.</p>
      <dl className="facts">
        <div>
          <dt>Runs in</dt>
          <dd>{RUNTIME_LABELS[agent.runtime]}</dd>
        </div>
        <div>
          <dt>Apps</dt>
          <dd>{agent.appIds.map((id) => catalogApp(id)?.label ?? id).join(", ")}</dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd>{ACCESS_LABELS[agent.access]}</dd>
        </div>
      </dl>
      <div className="panel-actions">
        <a className="btn-secondary" href={href("blast-radius", { start: agent.id })}>
          See blast radius
        </a>
        {!confirming && (
          <button type="button" className="btn-danger-ghost" onClick={() => setConfirming(true)}>
            Remove
          </button>
        )}
      </div>
      {confirming && (
        <div className="confirm" role="alertdialog" aria-label={`Remove ${agent.name}?`}>
          <p>
            Remove <strong>{agent.name}</strong>? It disappears from the graph and its findings
            close. Nothing outside AgentRadius changes.
          </p>
          <div className="panel-actions">
            <button
              type="button"
              className="btn-danger"
              onClick={() => remove.run(agent.id)}
              disabled={remove.busy}
            >
              {remove.busy ? "Removing…" : "Remove agent"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
          {remove.error !== null && (
            <p className="inline-error" role="alert">
              {remove.error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
