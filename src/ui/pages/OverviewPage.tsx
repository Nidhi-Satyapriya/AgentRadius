import { DECLARED_CONNECTOR_ID } from "../../domain/core.ts";
import { SeverityBadge } from "../components/Badges.tsx";
import { Empty } from "../components/States.tsx";
import { plural } from "../labels.ts";
import { href } from "../routing.ts";
import { useWorkspace } from "../workspace.tsx";

const ATTENTION_LIMIT = 4;

export function OverviewPage() {
  const ws = useWorkspace();
  const { overview, findings, reach, connectorRuns } = ws.data;
  const sources = connectorRuns.filter((r) => r.connectorId !== DECLARED_CONNECTOR_ID);
  const read = sources.filter((r) => r.status === "completed" || r.status === "partial").length;
  const urgent = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const attention = (urgent.length > 0 ? urgent : findings).slice(0, ATTENTION_LIMIT);
  const agents = overview.nodeCounts.Agent ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <h2>Overview</h2>
        <p className="muted">
          See what your AI agents and apps can access, what a compromise could affect, and which
          access to remove. Read-only: nothing is changed, monitored, or blocked.
        </p>
      </header>

      <div className="metrics" role="list">
        <Metric
          href={href("integrations")}
          value={`${read} of ${sources.length}`}
          label="Sources read"
        />
        <Metric href={href("graph")} value={agents} label="AI agents" />
        <Metric
          href={href("blast-radius")}
          value={reach.resourceIds.length}
          label="Resources agents can reach"
        />
        <Metric
          href={href("remediation")}
          value={findings.length}
          label={`Open findings · ${urgent.length} critical or high`}
          alert={urgent.length > 0}
        />
      </div>
      {overview.coverageGaps.length > 0 && (
        <p className="muted note">
          {plural(overview.coverageGaps.length, "source")} can&apos;t see everything. Missing data
          is not proof of safety. <a href={href("integrations")}>See gaps</a>
        </p>
      )}

      <section className="card" aria-labelledby="attention-title">
        <div className="card-head">
          <h3 id="attention-title">Needs attention</h3>
          {findings.length > attention.length && (
            <a href={href("remediation")}>All {findings.length} findings</a>
          )}
        </div>
        {attention.length === 0 ? (
          <Empty>
            No findings. This covers only the sources on the{" "}
            <a href={href("integrations")}>Integrations</a> page.
          </Empty>
        ) : (
          <ol className="finding-rows">
            {attention.map((f) => (
              <li key={f.id}>
                <SeverityBadge value={f.severity} />
                <span>{f.title}</span>
                <a href={href("remediation", { finding: f.id })} aria-label={`Review: ${f.title}`}>
                  Review
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>

      <nav className="next-steps" aria-label="Next steps">
        <a href={href("integrations")}>
          <strong>Add agents and apps</strong>
          <span>Include assistants AgentRadius can&apos;t detect.</span>
        </a>
        <a href={href("blast-radius")}>
          <strong>Check an agent&apos;s blast radius</strong>
          <span>See what it could read or change.</span>
        </a>
        <a href={href("remediation")}>
          <strong>Remove unneeded access</strong>
          <span>Work through findings by severity.</span>
        </a>
      </nav>
    </div>
  );
}

function Metric({
  href: to,
  value,
  label,
  alert = false,
}: {
  href: string;
  value: number | string;
  label: string;
  alert?: boolean;
}) {
  return (
    <a className={`metric ${alert ? "is-alert" : ""}`} href={to} role="listitem">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </a>
  );
}
