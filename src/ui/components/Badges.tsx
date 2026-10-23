import type {
  Assertion,
  Confidence,
  ConnectorStatus,
  EnforcementState,
  Severity,
} from "../../domain/core.ts";

/** Every badge carries a text label so status never depends on color alone. */
function Badge({
  kind,
  value,
  text,
  title,
}: {
  kind: string;
  value: string;
  text: string;
  title?: string;
}) {
  return (
    <span className={`badge badge-${kind} badge-${kind}-${value}`} title={title}>
      {text}
    </span>
  );
}

const ASSERTION_HELP: Record<Assertion, string> = {
  observed: "Directly observed through a supported mechanism",
  declared: "Stated by configuration or provider metadata; not proven effective",
  inferred: "Derived by a named inference rule",
  hypothetical: "Introduced by a simulation; not a claim about current access",
  unknown: "Could not be established either way. Unknown is not denied.",
};

export function AssertionBadge({ value }: { value: Assertion }) {
  const glyph = { observed: "●", declared: "◐", inferred: "◌", hypothetical: "◇", unknown: "?" }[
    value
  ];
  return (
    <Badge
      kind="assertion"
      value={value}
      text={`${glyph} ${value}`}
      title={ASSERTION_HELP[value]}
    />
  );
}

export function ConfidenceBadge({ value }: { value: Confidence }) {
  return <Badge kind="confidence" value={value} text={`${value} confidence`} />;
}

export function SeverityBadge({ value }: { value: Severity }) {
  return <Badge kind="severity" value={value} text={value} />;
}

const ENFORCEMENT_TEXT: Record<EnforcementState, string> = {
  enforced_verified: "enforced (verified)",
  monitor_only: "monitor only",
  advisory: "advisory",
  external_declared: "external, unverified",
  not_enforceable: "not enforceable",
};

export function EnforcementBadge({ value }: { value: EnforcementState }) {
  return <Badge kind="enforcement" value={value} text={ENFORCEMENT_TEXT[value]} />;
}

export function ConnectorStatusBadge({ value }: { value: ConnectorStatus }) {
  return <Badge kind="status" value={value} text={value.replaceAll("_", " ")} />;
}

export function StaleBadge() {
  return (
    <Badge kind="stale" value="stale" text="⧗ stale" title="Older than the staleness threshold" />
  );
}
