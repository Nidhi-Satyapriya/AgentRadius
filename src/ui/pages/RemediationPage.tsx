import { useMemo, useState } from "react";
import {
  compareSeverity,
  EDGE_SEMANTICS,
  SEVERITIES,
  type NodeType,
  type Severity,
} from "../../domain/core.ts";
import { ConfidenceBadge, SeverityBadge, StaleBadge } from "../components/Badges.tsx";
import { PathExplanation } from "../components/PathExplanation.tsx";
import { Empty } from "../components/States.tsx";
import { TYPE_LABELS } from "../labels.ts";
import { href } from "../routing.ts";
import { useWorkspace, type WorkspaceModel } from "../workspace.tsx";

type Finding = WorkspaceModel["data"]["findings"][number];

const STATUS_LABELS: Record<Finding["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  accepted_risk: "Accepted risk",
  resolved: "Resolved",
  false_positive: "Not an issue",
};
const PREVIEWABLE: readonly NodeType[] = [
  "Agent",
  "MCPServer",
  "Application",
  "Tool",
  "CredentialReference",
  "OAuthGrant",
  "UserIdentity",
];

export function RemediationPage({ focusId }: { focusId: string | null }) {
  const ws = useWorkspace();
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [query, setQuery] = useState("");
  const all = useMemo(
    () =>
      [...ws.data.findings].sort(
        (a, b) => compareSeverity(a.severity, b.severity) || a.title.localeCompare(b.title),
      ),
    [ws.data.findings],
  );
  const q = query.trim().toLowerCase();
  const findings = all.filter(
    (f) =>
      (severity === "all" || f.severity === severity) &&
      (q === "" ||
        f.title.toLowerCase().includes(q) ||
        f.affectedEntityIds.some((id) => ws.label(id).toLowerCase().includes(q))),
  );
  const selected = findings.find((f) => f.id === focusId) ?? findings[0] ?? null;

  return (
    <div className="page">
      <header className="page-header">
        <h2>Remediation</h2>
        <p className="muted">
          Findings ranked by potential impact, with the evidence and the change that reduces it.
        </p>
      </header>
      <p className="note">
        AgentRadius can&apos;t change app or provider settings. Make the change where the access is
        granted, then scan again to confirm it&apos;s gone.
      </p>

      {all.length === 0 ? (
        <Empty>No findings for the connected sources.</Empty>
      ) : (
        <>
          <div className="toolbar">
            <label className="search">
              <span className="sr-only">Search findings</span>
              <input
                type="search"
                placeholder="Search findings or affected items"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="segmented" role="radiogroup" aria-label="Severity">
              {(["all", ...SEVERITIES] as const).map((s) => {
                const count =
                  s === "all" ? all.length : (ws.data.overview.findingsBySeverity[s] ?? 0);
                if (s !== "all" && count === 0) return null;
                return (
                  <label key={s}>
                    <input
                      type="radio"
                      name="severity"
                      checked={severity === s}
                      onChange={() => setSeverity(s)}
                    />
                    {s === "all" ? "All" : s[0]!.toUpperCase() + s.slice(1)} {count}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="master-detail">
            <ul className="finding-list" aria-label="Findings">
              {findings.length === 0 && <li className="muted">No findings match.</li>}
              {findings.map((f) => (
                <li key={f.id}>
                  <a
                    href={href("remediation", { finding: f.id })}
                    aria-current={f.id === selected?.id ? "true" : undefined}
                  >
                    <SeverityBadge value={f.severity} />
                    <span className="finding-title">{f.title}</span>
                    <span className="row-sub">
                      {STATUS_LABELS[f.status]} ·{" "}
                      {f.affectedEntityIds.map((id) => ws.label(id)).join(", ")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            {selected && <FindingDetail finding={selected} />}
          </div>
        </>
      )}
    </div>
  );
}

function FindingDetail({ finding: f }: { finding: Finding }) {
  const ws = useWorkspace();
  const steps = f.pathEdgeIds.flatMap((id) => {
    const e = ws.edge(id);
    if (!e) return [];
    const direction = EDGE_SEMANTICS[e.type].propagation === "reverse" ? "reverse" : "forward";
    return [{ edgeId: id, edgeType: e.type, fromId: e.from, toId: e.to, direction } as const];
  });
  const previewStart = f.affectedEntityIds.find((id) => {
    const n = ws.node(id);
    return n !== undefined && PREVIEWABLE.includes(n.type);
  });

  return (
    <article className="card finding-detail" aria-labelledby={`f-${f.id}`}>
      <div className="finding-badges">
        <SeverityBadge value={f.severity} /> <ConfidenceBadge value={f.confidence} />
        {f.evidenceIsStale && <StaleBadge />}
        <span className="status-pill tone-neutral">{STATUS_LABELS[f.status]}</span>
      </div>
      <h3 id={`f-${f.id}`}>{f.title}</h3>
      <p>{f.rationale}</p>

      <h4>Affected</h4>
      <ul className="inline">
        {f.affectedEntityIds.map((id) => {
          const n = ws.node(id);
          return (
            <li key={id}>
              <a href={href("graph", { focus: id })}>{ws.label(id)}</a>
              {n && <span className="muted"> ({TYPE_LABELS[n.type]})</span>}
            </li>
          );
        })}
      </ul>

      <h4>Recommended action</h4>
      <ol>
        {f.remediation.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
      <div className="panel-actions">
        {previewStart && (
          <a className="btn-primary" href={href("blast-radius", { start: previewStart })}>
            Preview the reduction
          </a>
        )}
        {steps.length > 0 && (
          <a
            className="btn-secondary"
            href={href("graph", {
              focus: f.affectedEntityIds[0] ?? "",
              path: f.pathEdgeIds.join(","),
            })}
          >
            Open path in graph
          </a>
        )}
      </div>
      <p className="muted small">
        The preview measures how much reach each change removes, on a copy. Nothing is changed.
      </p>

      {steps.length > 0 && (
        <>
          <h4>Evidence</h4>
          <PathExplanation path={{ steps }} />
        </>
      )}
      <details className="disclosure">
        <summary>Assumptions and source</summary>
        {f.assumptions.length > 0 && (
          <ul>
            {f.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        <p className="muted">
          Rule <code>{f.ruleId}</code> v{f.ruleVersion} · evidence:{" "}
          {f.evidenceRefs.join("; ") || "none"}
        </p>
      </details>
    </article>
  );
}
