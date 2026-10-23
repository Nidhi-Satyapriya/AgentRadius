import { EDGE_SEMANTICS, enforcementStateOf } from "../../domain/core.ts";
import type { GraphEdge, GraphNode, Provenance } from "../../domain/index.ts";
import {
  AssertionBadge,
  ConfidenceBadge,
  EnforcementBadge,
  SeverityBadge,
  StaleBadge,
} from "../components/Badges.tsx";
import { TYPE_LABELS } from "../labels.ts";
import { href } from "../routing.ts";
import { useWorkspace } from "../workspace.tsx";
import type { Selection } from "./GraphCanvas.tsx";

const COMPROMISABLE_TYPES = new Set([
  "Agent",
  "Application",
  "MCPServer",
  "Tool",
  "CredentialReference",
  "OAuthGrant",
  "UserIdentity",
  "Process",
  "CloudRole",
]);

function ProvenanceList({ items }: { items: readonly Provenance[] }) {
  return (
    <ul className="provenance">
      {items.map((p) => (
        <li key={`${p.connectorId}|${p.evidenceRef}|${p.observedAt}`}>
          <code>{p.connectorId}</code> · {p.collectionMethod.replaceAll("_", " ")} ·{" "}
          {new Date(p.observedAt).toLocaleString()}
          <div className="muted">Evidence: {p.evidenceRef}</div>
        </li>
      ))}
    </ul>
  );
}

function Attributes({ attributes }: { attributes: GraphNode["attributes"] }) {
  const entries = Object.entries(attributes).sort(([a], [b]) => (a < b ? -1 : 1));
  if (entries.length === 0) return null;
  return (
    <dl className="attributes">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function EdgeLink({
  edge,
  perspective,
  onSelect,
}: {
  edge: GraphEdge;
  perspective: string;
  onSelect: (s: Selection) => void;
}) {
  const ws = useWorkspace();
  const outgoing = edge.from === perspective;
  const other = outgoing ? edge.to : edge.from;
  return (
    <li>
      <button
        type="button"
        className="link"
        onClick={() => onSelect({ kind: "edge", id: edge.id })}
      >
        {outgoing ? "→" : "←"} {EDGE_SEMANTICS[edge.type].verb} {ws.label(other)}
      </button>{" "}
      <AssertionBadge value={edge.assertion} />
    </li>
  );
}

function NodeDetails({ node, onSelect }: { node: GraphNode; onSelect: (s: Selection) => void }) {
  const ws = useWorkspace();
  const outgoing = ws.data.edges.filter((e) => e.from === node.id);
  const incoming = ws.data.edges.filter((e) => e.to === node.id);
  const findings = ws.findingsFor(node.id);
  const enforcement = enforcementStateOf(node);
  return (
    <>
      <header>
        <p className="eyebrow">{TYPE_LABELS[node.type]}</p>
        <h3>{node.label}</h3>
        {ws.isStale(node.id) && <StaleBadge />}
      </header>
      {node.description && <p>{node.description}</p>}
      {node.trustBoundaryId && (
        <p className="muted">
          Inside <strong className="text">{ws.label(node.trustBoundaryId)}</strong>
        </p>
      )}
      {enforcement && (
        <p>
          Control state: <EnforcementBadge value={enforcement} />
        </p>
      )}
      {COMPROMISABLE_TYPES.has(node.type) && (
        <a className="btn-secondary" href={href("blast-radius", { start: node.id })}>
          See blast radius
        </a>
      )}
      {findings.length > 0 && (
        <section>
          <h4>Findings</h4>
          <ul className="plain">
            {findings.map((f) => (
              <li key={f.id}>
                <SeverityBadge value={f.severity} />{" "}
                <a href={href("remediation", { finding: f.id })}>{f.title}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h4>Relationships ({outgoing.length + incoming.length})</h4>
        <ul className="plain">
          {[...outgoing, ...incoming].map((e) => (
            <EdgeLink key={e.id} edge={e} perspective={node.id} onSelect={onSelect} />
          ))}
        </ul>
      </section>
      <details className="disclosure">
        <summary>Technical details</summary>
        <p>
          <code className="muted">{node.id}</code>
        </p>
        <Attributes attributes={node.attributes} />
        <h4>Provenance</h4>
        <ProvenanceList items={node.provenance} />
      </details>
    </>
  );
}

function EdgeDetails({ edge, onSelect }: { edge: GraphEdge; onSelect: (s: Selection) => void }) {
  const ws = useWorkspace();
  const semantics = EDGE_SEMANTICS[edge.type];
  return (
    <>
      <header>
        <p className="eyebrow">Relationship</p>
        <h3>
          <button
            type="button"
            className="link"
            onClick={() => onSelect({ kind: "node", id: edge.from })}
          >
            {ws.label(edge.from)}
          </button>{" "}
          {semantics.verb}{" "}
          <button
            type="button"
            className="link"
            onClick={() => onSelect({ kind: "node", id: edge.to })}
          >
            {ws.label(edge.to)}
          </button>
        </h3>
      </header>
      <p className="step-badges">
        <AssertionBadge value={edge.assertion} /> <ConfidenceBadge value={edge.confidence} />
        {ws.isStale(edge.id) && <StaleBadge />}
        {edge.lifecycle === "revoked" && <span className="badge badge-revoked">revoked</span>}
      </p>
      <dl className="attributes">
        <div>
          <dt>Propagation</dt>
          <dd>
            {semantics.propagation === "none"
              ? "Metadata only; never followed by blast-radius analysis"
              : semantics.propagation === "reverse"
                ? "Followed in reverse (compromise of the target affects the source)"
                : "Followed from source to target"}
          </dd>
        </div>
        {edge.requiresAction && (
          <div>
            <dt>Requires</dt>
            <dd>{edge.requiresAction} access to the source before it can be followed</dd>
          </div>
        )}
        {edge.inferenceRule && (
          <div>
            <dt>Inference rule</dt>
            <dd>{edge.inferenceRule}</dd>
          </div>
        )}
        {edge.scopes && edge.scopes.length > 0 && (
          <div>
            <dt>Scopes</dt>
            <dd>{edge.scopes.join(", ")}</dd>
          </div>
        )}
      </dl>
      {edge.conditions.length > 0 && (
        <section>
          <h4>Conditions</h4>
          <ul>
            {edge.conditions.map((c) => (
              <li key={c.description}>
                <span className={`badge badge-condition-${c.state}`}>
                  {c.state.replaceAll("_", " ")}
                </span>{" "}
                {c.description}
              </li>
            ))}
          </ul>
        </section>
      )}
      <details className="disclosure">
        <summary>Technical details</summary>
        <p>
          <code className="muted">{edge.id}</code> · {edge.type}
        </p>
        <Attributes attributes={edge.attributes} />
        <h4>Provenance</h4>
        <ProvenanceList items={edge.provenance} />
      </details>
    </>
  );
}

export function EntityPanel({
  selection,
  onSelect,
}: {
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}) {
  const ws = useWorkspace();
  if (selection === null) {
    return (
      <aside className="entity-panel" aria-label="Details">
        <p className="muted">Select an item to see what it can access and why.</p>
      </aside>
    );
  }
  const node = selection.kind === "node" ? ws.node(selection.id) : undefined;
  const edge = selection.kind === "edge" ? ws.edge(selection.id) : undefined;
  return (
    <aside className="entity-panel" aria-label="Details" aria-live="polite">
      {node && <NodeDetails node={node} onSelect={onSelect} />}
      {edge && <EdgeDetails edge={edge} onSelect={onSelect} />}
      {!node && !edge && <p className="muted">This entity is not in the current snapshot.</p>}
    </aside>
  );
}
