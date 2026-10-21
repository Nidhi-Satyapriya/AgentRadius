/**
 * Canonical vocabulary for the AgentRadius permission graph.
 * Every other module imports these lists; nothing else defines its own copy.
 */

/**
 * Types are added when a connector or analysis needs them (see docs/data-model.md for deferred
 * types such as MCPClient, IdentityProvider, and Group).
 */
export const NODE_TYPES = [
  "UserIdentity",
  "Application",
  "Process",
  "Agent",
  "MCPServer",
  "Tool",
  "OAuthGrant",
  "CredentialReference",
  "CloudRole",
  "Resource",
  "Permission",
  "Policy",
  "TrustBoundary",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  "RUNS_AS",
  "HOSTS",
  "CONNECTS_TO",
  "EXPOSES_TOOL",
  "AUTHENTICATES_WITH",
  "HOLDS_CREDENTIAL_REFERENCE",
  "GRANTS_SCOPE",
  "ASSUMES_ROLE",
  "CAN_READ",
  "CAN_WRITE",
  "CAN_DELETE",
  "CAN_EXECUTE",
  "CAN_ADMIN",
  "DELEGATES_TO",
  "TRUSTS",
  "REACHES",
  "CONTROLLED_BY",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

/**
 * How a relationship is known. Ordered strongest first.
 * - observed: directly observed through a supported mechanism (OS API, live provider response).
 * - declared: stated by configuration, a manifest, or a provider's metadata; not proven effective.
 * - inferred: derived from evidence by a named inference rule.
 * - hypothetical: introduced by a simulation; never a claim about current access.
 * - unknown: a relationship that may exist but could not be established either way.
 */
export const ASSERTIONS = ["observed", "declared", "inferred", "hypothetical", "unknown"] as const;
export type Assertion = (typeof ASSERTIONS)[number];

/**
 * Confidence in the correctness of a single record; it is not severity and not a probability.
 * - high: authoritative source, unambiguous mapping.
 * - medium: deterministic derivation with disclosed assumptions.
 * - low: heuristic, ambiguous mapping, or incomplete inventory.
 */
export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const LIFECYCLES = ["active", "revoked"] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export const ACTIONS = ["read", "write", "delete", "execute", "admin"] as const;
export type Action = (typeof ACTIONS)[number];

export const COLLECTION_METHODS = [
  "fixture",
  "config_parse",
  "filesystem_metadata",
  "os_api",
  "provider_api",
  "runtime_observation",
  "user_import",
  "inference_rule",
] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export const CONDITION_STATES = ["holds", "does_not_hold", "unresolved"] as const;
export type ConditionState = (typeof CONDITION_STATES)[number];

/**
 * Enforcement state of a control (Policy node). Only `enforced_verified` may limit
 * propagation in analysis; every other state is informational.
 */
export const ENFORCEMENT_STATES = [
  "enforced_verified",
  "monitor_only",
  "advisory",
  "external_declared",
  "not_enforceable",
] as const;
export type EnforcementState = (typeof ENFORCEMENT_STATES)[number];

export const CONNECTOR_STATUSES = [
  "completed",
  "partial",
  "requires_permission",
  "unsupported",
  "failed",
  "disabled",
  "not_implemented",
] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const DATA_ORIGINS = ["fixture", "local_discovery", "import"] as const;
export type DataOrigin = (typeof DATA_ORIGINS)[number];

const ASSERTION_RANK: Record<Assertion, number> = {
  observed: 0,
  declared: 1,
  inferred: 2,
  hypothetical: 3,
  unknown: 4,
};

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

/** Returns the weaker of two assertions (used to summarize a path). */
export function weakerAssertion(a: Assertion, b: Assertion): Assertion {
  return ASSERTION_RANK[a] >= ASSERTION_RANK[b] ? a : b;
}

/** Returns the stronger of two assertions (used when corroborating sources merge). */
export function strongerAssertion(a: Assertion, b: Assertion): Assertion {
  return ASSERTION_RANK[a] <= ASSERTION_RANK[b] ? a : b;
}

export function lowerConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

export function higherConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

export function compareConfidence(a: Confidence, b: Confidence): number {
  return CONFIDENCE_RANK[a] - CONFIDENCE_RANK[b];
}

/** Potential impact of a finding. Independent of confidence. */
export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}
