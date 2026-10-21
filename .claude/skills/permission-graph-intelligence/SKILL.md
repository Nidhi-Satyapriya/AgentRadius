---
name: permission-graph-intelligence
description: Design, implement, test, and review AgentRadius's canonical permission graph, access relationships, trust boundaries, provenance, reachability, blast-radius analysis, and explainable security findings. Use whenever working on graph models, permission analysis, attack paths, or risk visualization.
---

# Permission Graph Intelligence

## Objective

Build a deterministic, evidence-backed graph that explains which applications, identities, AI agents, MCP servers, tools, credentials, and resources are connected; what access relationships exist; and how a compromise could propagate.

The graph must distinguish confirmed facts from declared capabilities, inferred relationships, unknowns, and hypothetical attack paths.

Follow the repository's `modular-engineering` skill at all times.

## 1. Canonical Domain Model

Maintain a single authoritative graph model.

Support domain entities where relevant:

- UserIdentity
- Application
- Process
- Agent
- MCPClient
- MCPServer
- Tool
- Integration
- OAuthGrant
- CredentialReference
- IdentityProvider
- CloudRole
- Group
- Resource
- Permission
- Capability
- Policy
- TrustBoundary
- Finding

Do not create every entity type speculatively. Add a type when a real connector or analysis use case requires it.

Every node must have a stable ID, type, display label, source, and appropriate provenance metadata.

Every edge must have a stable ID, source node, target node, relationship type, evidence, observation time, and relationship status.

Use typed contracts and schema validation at ingestion boundaries.

## 2. Evidence and Provenance

Classify relationships explicitly:

- `observed`: directly observed through a supported mechanism.
- `declared`: specified in a configuration, manifest, or provider response.
- `inferred`: derived from documented evidence and an explicit inference rule.
- `hypothetical`: a scenario used for simulation, not a claim about current access.
- `unknown`: insufficient evidence to establish the relationship.

Preserve the original source and collection time.

Record confidence only when it has a defined interpretation. Do not invent numerical probabilities.

Do not convert a missing relationship into proof that access is impossible.

Do not treat a declared permission as proof that the permission is effective or has been exercised.

Do not treat an observed tool invocation as proof that every action the tool exposes has been exercised.

Keep raw secret values out of graph entities and provenance records.

## 3. Graph Construction

Implement graph ingestion as a separate module from analysis.

Requirements:

- Validate nodes and edges before ingestion.
- Normalize identifiers without destroying source identity.
- Deduplicate equivalent entities using documented matching rules.
- Preserve multiple evidence records when sources corroborate the same relationship.
- Represent conflicting observations explicitly.
- Track stale observations and connector failures.
- Make repeated ingestion of identical data idempotent.
- Avoid destructive replacement of newer or more authoritative evidence.
- Version schema changes and provide migration strategies.

Never silently merge two identities solely because their display names match.

## 4. Permission Semantics

Represent access as a relationship among a principal, an action, a resource, and applicable conditions.

Where supported, model:

- Principal or acting identity.
- Resource or resource class.
- Action, such as read, write, delete, execute, or administer.
- Scope and constraints.
- Credential or authorization mechanism.
- Source of authority.
- Conditions and environment.
- Evidence and effective-status certainty.

Distinguish between:

1. A tool that exists.
2. An action that a tool declares.
3. A principal that has authorization.
4. A path through which the action may be reachable.
5. An action that was actually invoked.
6. An action that an enforcement mechanism permits or denies.

These are different facts and must not be collapsed into a single permission flag.

## 5. Reachability and Blast Radius

Implement deterministic graph traversal with explicit edge eligibility rules.

Support queries such as:

- Which resources could a compromised agent reach?
- Which tools rely on a given credential reference?
- Which identities can delegate access to another identity?
- Which trust boundaries are crossed by a path?
- What could change if a permission or connection were removed?
- Which reachable resources have destructive or administrative actions?
- Which paths depend on inferred or stale relationships?

Every result must include:

- Starting entity and assumed compromise.
- Reachable entities.
- Relationship path explaining each result.
- Relevant permissions and actions.
- Evidence and uncertainty.
- Trust-boundary crossings.
- Applicable controls.
- Recommended remediation.

Prevent cycles and unbounded traversal. Use explicit depth and result limits for large graphs.

Do not equate reachability with exploitability. Report potential impact and assumptions separately.

Do not invent likelihoods, monetary losses, or guaranteed compromise outcomes.

## 6. Risk Findings

Generate findings through documented, testable rules.

Each finding should contain:

- Stable finding ID.
- Rule ID and rule version.
- Severity and rationale.
- Affected entities.
- Supporting evidence.
- Attack or access path.
- Assumptions and uncertainty.
- Remediation recommendation.
- Expected impact of remediation.
- Detection timestamp and freshness.
- Related policy controls, if any.

Keep finding generation separate from graph traversal and presentation.

Avoid counting the same underlying issue repeatedly through overlapping rules unless each finding represents a distinct, justified risk.

## 7. Remediation Simulation

Simulate proposed changes against a graph snapshot or versioned state.

Examples:

- Remove an OAuth scope.
- Disable a tool.
- Restrict a server connection.
- Remove a delegation relationship.
- Introduce a policy restriction.

Report which paths disappear, which remain, and what functionality could be affected.

Simulation must not mutate live configurations, revoke credentials, or execute external actions.

Make assumptions explicit when effective permissions cannot be determined.

## 8. Performance and Determinism

- Keep core graph algorithms independent of the UI and external connectors.
- Use stable ordering where it affects results.
- Avoid repeated full-graph scans when indexed traversal is appropriate.
- Use bounded traversal and pagination.
- Cache results only with clear invalidation rules.
- Ensure identical graph snapshots and analysis settings produce equivalent results.
- Do not make network calls during pure graph evaluation.

## 9. Testing Requirements

Add tests for:

- Schema validation.
- Stable IDs and deduplication.
- Multiple sources supporting one relationship.
- Conflicting and stale evidence.
- Cycles and bounded traversal.
- Multi-hop reachability.
- Trust-boundary crossings.
- Permission removal simulations.
- Inferred versus observed relationships.
- Unknown and incomplete access information.
- Deterministic output.
- Secret redaction.

Use small, hand-verifiable fixtures before introducing large synthetic graphs.

## 10. Definition of Done

Before completing a graph-related task, verify:

- [ ] The canonical model and schemas are consistent.
- [ ] Provenance and relationship status are preserved.
- [ ] Reachability rules are explicit.
- [ ] Results explain paths rather than presenting unexplained scores.
- [ ] Uncertainty is visible.
- [ ] Analysis is deterministic and bounded.
- [ ] Tests cover relevant edge cases.
- [ ] No secret values are persisted or exposed.
- [ ] Documentation describes limitations and assumptions.

Prefer an explainable result over a more impressive but unsubstantiated risk score.