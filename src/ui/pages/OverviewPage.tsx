import type { ReactNode } from "react";
import { DECLARED_CONNECTOR_ID } from "../../domain/core.ts";
import { useAuth } from "../auth.tsx";
import { SignInButton } from "../components/AccountMenu.tsx";
import { SeverityBadge } from "../components/Badges.tsx";
import { NavIcon, type IconName } from "../components/NavIcon.tsx";
import { Empty } from "../components/States.tsx";
import { plural } from "../labels.ts";
import { href, type RoutePath } from "../routing.ts";
import { useWorkspace } from "../workspace.tsx";

const ATTENTION_LIMIT = 4;

const FEATURES: readonly { icon: IconName; title: string; text: string; to: RoutePath }[] = [
  {
    icon: "integrations",
    title: "Discover MCP setups",
    text: "Reads the MCP configs of Cursor, VS Code, Claude Desktop, Claude Code, and Windsurf. Read-only.",
    to: "integrations",
  },
  {
    icon: "pulse",
    title: "Add in-app agents",
    text: "Rovo, Copilot, Gemini, Slack AI and others live inside apps. Add them one by one.",
    to: "integrations",
  },
  {
    icon: "graph",
    title: "Map every permission",
    text: "One graph from agents to servers, credentials, and the data they reach, with evidence.",
    to: "graph",
  },
  {
    icon: "blast-radius",
    title: "Measure blast radius",
    text: "If an agent were compromised, see what it could read, change, or delete.",
    to: "blast-radius",
  },
  {
    icon: "remediation",
    title: "Remediate with previews",
    text: "Ranked findings with a dry-run preview of how much each fix shrinks reach.",
    to: "remediation",
  },
  {
    icon: "settings",
    title: "Local and honest",
    text: "Nothing leaves this Mac. Secrets are never read into the app. Nothing is blocked or changed.",
    to: "settings",
  },
];

export function OverviewPage({ signInFailed = false }: { signInFailed?: boolean }) {
  const ws = useWorkspace();
  const { auth } = useAuth();
  const { data } = ws;
  const hasData = data.nodes.length > 0;
  const agentsAdded = data.declaredAgents.length;
  const scanned = data.scannedAt !== null;
  const signedIn = auth?.user != null;

  return (
    <div className="page overview">
      {signInFailed && (
        <p className="inline-error" role="alert">
          Sign-in didn&apos;t complete. Try again, or keep going without signing in.
        </p>
      )}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Permission intelligence for AI agents · runs on this Mac</p>
          <h2 id="hero-title">
            See everything your AI agents <span className="accent-text">can reach.</span>
          </h2>
          <p className="hero-lede">
            AgentRadius maps your agents, MCP servers, credentials, and app access into one
            permission graph. Then it shows what a compromise could affect and which access to
            remove first.
          </p>
          <div className="hero-actions">
            <a className="btn-primary btn-lg" href={href("integrations")}>
              Integrate your AgentRadius setup <span aria-hidden="true">→</span>
            </a>
            {!signedIn && <SignInButton large />}
          </div>
          <ul className="trust-row">
            <li>Read-only: nothing is changed, monitored, or blocked</li>
            <li>Nothing uploaded</li>
            <li>No sample data</li>
          </ul>
        </div>
        <RadiusIllustration />
      </section>

      <section aria-labelledby="features-title">
        <h3 id="features-title" className="section-title">
          What AgentRadius does
        </h3>
        <ul className="feature-grid">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <a className="feature" href={href(f.to)}>
                <span className="feature-icon">
                  <NavIcon name={f.icon} />
                </span>
                <strong>{f.title}</strong>
                <span className="muted">{f.text}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="start-title">
        <div className="card-head">
          <h3 id="start-title">Get started</h3>
          <a href={href("integrations")}>Integrate your setup →</a>
        </div>
        <ol className="journey">
          <Step
            n={1}
            done={signedIn}
            title="Sign in"
            text={
              signedIn
                ? `Signed in as ${auth!.user!.name}`
                : "Optional. Google identifies you; no access to your Google data."
            }
          />
          <Step
            n={2}
            done={agentsAdded > 0}
            title="Add your agents"
            text={agentsAdded > 0 ? `${plural(agentsAdded, "agent")} added` : "Pick from the list"}
            to="integrations"
          />
          <Step
            n={3}
            done={scanned}
            title="Scan this Mac"
            text={scanned ? "Done" : "Finds MCP servers, read-only"}
            to="integrations"
          />
          <Step
            n={4}
            done={false}
            title="See map & blast radius"
            text={hasData ? "Ready" : "After step 2 or 3"}
            {...(hasData ? { to: "graph" as const } : {})}
          />
          <Step
            n={5}
            done={false}
            title="Remediate"
            text={hasData ? plural(data.findings.length, "finding") : "Fix the riskiest first"}
            {...(hasData ? { to: "remediation" as const } : {})}
          />
        </ol>
      </section>

      {hasData && <WorkspaceSummary />}
    </div>
  );
}

function Step({
  n,
  done,
  title,
  text,
  to,
}: {
  n: number;
  done: boolean;
  title: string;
  text: ReactNode;
  to?: RoutePath;
}) {
  const body = (
    <>
      <span className="step-num" aria-hidden="true">
        {done ? "✓" : n}
      </span>
      <strong>{title}</strong>
      <span className="muted">{text}</span>
    </>
  );
  return (
    <li className={done ? "is-done" : ""}>
      {to ? <a href={href(to)}>{body}</a> : <div>{body}</div>}
      {done && <span className="sr-only">(done)</span>}
    </li>
  );
}

function WorkspaceSummary() {
  const { overview, findings, reach, connectorRuns } = useWorkspace().data;
  const sources = connectorRuns.filter((r) => r.connectorId !== DECLARED_CONNECTOR_ID);
  const read = sources.filter((r) => r.status === "completed" || r.status === "partial").length;
  const urgent = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const attention = (urgent.length > 0 ? urgent : findings).slice(0, ATTENTION_LIMIT);

  return (
    <>
      <h3 className="section-title">Your workspace</h3>
      <div className="metrics" role="list">
        <Metric
          href={href("integrations")}
          value={`${read} of ${sources.length}`}
          label="Sources read"
        />
        <Metric href={href("graph")} value={overview.nodeCounts.Agent ?? 0} label="AI agents" />
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
    </>
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

const ORBITS: readonly { r: number; label: string; nodes: readonly [number, string][] }[] = [
  {
    r: 78,
    label: "Servers & tools",
    nodes: [
      [-35, "MCP server"],
      [150, "Tool"],
    ],
  },
  {
    r: 128,
    label: "Credentials",
    nodes: [
      [25, "Token"],
      [205, "OAuth grant"],
    ],
  },
  {
    r: 176,
    label: "Your data",
    nodes: [
      [-70, "Repos"],
      [-5, "Docs"],
      [110, "Mail"],
      [250, "Cloud"],
    ],
  },
];

/** Decorative: an agent at the center with its reach drawn as rings. Not data. */
function RadiusIllustration() {
  const cx = 210;
  const cy = 200;
  const at = (r: number, deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  return (
    <figure className="hero-art">
      <svg viewBox="0 0 420 400" role="img" aria-labelledby="hero-art-title">
        <title id="hero-art-title">
          Illustration: an AI agent at the center, with the servers, credentials, and data it can
          reach drawn as widening rings.
        </title>
        <defs>
          <radialGradient id="hero-glow">
            <stop offset="0%" className="glow-stop-a" />
            <stop offset="100%" className="glow-stop-b" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={190} fill="url(#hero-glow)" />
        {ORBITS.map((o, i) => (
          <circle key={o.r} cx={cx} cy={cy} r={o.r} className={`orbit orbit-${i}`} />
        ))}
        {ORBITS.flatMap((o, i) =>
          o.nodes.map(([deg]) => {
            const p = at(o.r, deg);
            return (
              <line
                key={`l${o.r}${deg}`}
                x1={cx}
                y1={cy}
                x2={p.x}
                y2={p.y}
                className={`ray ray-${i}`}
              />
            );
          }),
        )}
        {ORBITS.flatMap((o, i) =>
          o.nodes.map(([deg, label]) => {
            const p = at(o.r, deg);
            const w = label.length * 6.6 + 22;
            return (
              <g key={label} className={`orbit-node orbit-node-${i}`}>
                <rect x={p.x - w / 2} y={p.y - 13} width={w} height={26} rx={13} />
                <text x={p.x} y={p.y + 4} textAnchor="middle">
                  {label}
                </text>
              </g>
            );
          }),
        )}
        <g className="core-node">
          <circle cx={cx} cy={cy} r={34} />
          <text x={cx} y={cy - 2} textAnchor="middle">
            AI
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="core-sub">
            agent
          </text>
        </g>
      </svg>
      <figcaption className="hero-legend">
        {ORBITS.map((o, i) => (
          <span key={o.label}>
            <i className={`dot dot-${i}`} aria-hidden="true" />
            {o.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
