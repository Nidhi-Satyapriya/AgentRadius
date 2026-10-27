import { enforcementStateOf } from "../../domain/core.ts";
import { EnforcementBadge } from "../components/Badges.tsx";
import { href } from "../routing.ts";
import { useWorkspace } from "../workspace.tsx";

export function SettingsPage() {
  const ws = useWorkspace();
  const { settings } = ws.data;
  const policies = ws.data.nodes.filter((n) => n.type === "Policy");

  return (
    <div className="page page-narrow">
      <header className="page-header">
        <h2>Settings</h2>
        <p className="muted">How analysis runs and how your data is handled.</p>
      </header>

      <section className="card" aria-labelledby="s-analysis">
        <h3 id="s-analysis">Analysis defaults</h3>
        <dl className="facts">
          <div>
            <dt>Inferred relationships</dt>
            <dd>{settings.includeInferred ? "Followed" : "Not followed"}</dd>
          </div>
          <div>
            <dt>Unknown relationships</dt>
            <dd>{settings.includeUnknown ? "Treated as possible access" : "Not followed"}</dd>
          </div>
          <div>
            <dt>Maximum path length</dt>
            <dd>{settings.maxDepth} steps</dd>
          </div>
        </dl>
        <p className="muted small">
          Change these for a single analysis under Advanced analysis on the{" "}
          <a href={href("blast-radius")}>Blast Radius</a> page.
        </p>
      </section>

      <section className="card" aria-labelledby="s-data">
        <h3 id="s-data">Data handling</h3>
        <ul className="plain-list">
          <li>Read-only. AgentRadius never changes app configs, credentials, or macOS settings.</li>
          <li>Secret values are never stored or shown. Only where a credential is referenced.</li>
          <li>Everything stays on this Mac and in memory. Nothing is uploaded.</li>
          <li>Servers found in configs are never started, and their commands are never run.</li>
        </ul>
      </section>

      <section className="card" aria-labelledby="s-controls">
        <h3 id="s-controls">Controls</h3>
        <p className="muted">
          Controls recorded by your sources. AgentRadius doesn&apos;t create or enforce policies,
          and doesn&apos;t block anything. Only a control verified as enforced reduces blast radius.
        </p>
        {policies.length === 0 ? (
          <p className="muted">No controls were found in the connected sources.</p>
        ) : (
          <ul className="plain-list">
            {policies.map((p) => {
              const state = enforcementStateOf(p);
              const governs = ws.data.edges
                .filter((e) => e.type === "CONTROLLED_BY" && e.to === p.id)
                .map((e) => ws.label(e.from));
              return (
                <li key={p.id}>
                  {state && <EnforcementBadge value={state} />}{" "}
                  <a href={href("graph", { focus: p.id })}>{p.label}</a>
                  {governs.length > 0 && <span className="muted"> on {governs.join(", ")}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
