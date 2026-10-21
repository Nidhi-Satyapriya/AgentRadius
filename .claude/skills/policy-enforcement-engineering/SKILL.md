---
name: policy-enforcement-engineering
description: Design, implement, test, and review AgentRadius's security policies, MCP request interception, runtime mediation, tool-call restrictions, human approval, audit logging, policy simulation, revocation workflows, and enforcement safety. Use whenever implementing or modifying controls that allow, deny, inspect, or gate tool execution.
---

# Policy Enforcement Engineering

## Objective

Build a security policy system that can explain decisions and enforce them at verified control points.

The system must distinguish advisory risk findings, simulated policy decisions, monitored activity, and actually enforced controls.

Follow the repository's `modular-engineering` skill at all times.

## 1. Security Invariants

- Default to monitoring and dry-run evaluation before enabling enforcement.
- Apply least privilege.
- Never claim a request was blocked unless the enforcement point prevented it from reaching the protected operation.
- Do not confuse a UI setting with a runtime control.
- Fail safely when enforcement state is uncertain.
- Never bypass an upstream authorization boundary.
- Do not silently alter existing MCP configurations or credentials.
- Require explicit consent before activating controls that could interrupt user workflows.
- Maintain a recovery path for every supported enforcement change.

## 2. Architecture

Keep these responsibilities separate:

1. Policy definition and schema validation.
2. Policy storage and versioning.
3. Policy evaluation.
4. Request and context normalization.
5. Runtime interception adapters.
6. Human approval workflow.
7. Audit recording.
8. Policy simulation.
9. Dashboard presentation.
10. Enforcement health monitoring.

The policy evaluator must be deterministic and independent of the UI.

An enforcement adapter must validate the request, invoke the policy evaluator, enforce the result, and record the outcome.

Never put authorization logic exclusively in a frontend component.

## 3. Policy Model

Support policies over explicitly modeled attributes such as:

- Principal or agent.
- MCP server and tool.
- Action type.
- Resource or destination.
- Data classification where known.
- Execution context.
- Time or rate constraints.
- Approval requirements.
- Policy priority.
- Expiration.
- Scope and exceptions.

Use typed conditions and validated schemas.

Avoid arbitrary code execution inside policy definitions.

Define rule precedence and conflict resolution explicitly. Deny rules must not be accidentally overridden by broad allow rules.

Record the policy version and the rule responsible for each decision.

## 4. Decision Contract

Every decision must return a structured result with:

- Decision ID.
- Verdict.
- Policy version.
- Matched rule IDs.
- Explanation.
- Normalized request reference.
- Enforcement adapter ID.
- Approval requirement, if applicable.
- Audit correlation ID.
- Evaluation timestamp.

Supported verdicts:

- `ALLOW`
- `DENY`
- `REQUIRE_APPROVAL`
- `NOT_ENFORCEABLE`

Use `NOT_ENFORCEABLE` when the system cannot safely apply the requested control or cannot establish that the protected operation is mediated.

Do not treat an analysis warning as a deny decision.

Do not let a missing field silently satisfy a security-sensitive allow condition.

## 5. MCP Runtime Mediation

For each supported MCP transport, document the interception point and the limits of protection.

The mediation pipeline should:

1. Accept a request through the configured gateway.
2. Authenticate or identify the calling client where supported.
3. Validate the request envelope and size.
4. Normalize the tool name and arguments.
5. Evaluate the applicable policy.
6. Return a structured denial when denied.
7. Obtain explicit approval when required.
8. Forward only permitted requests.
9. Inspect responses when supported and required.
10. Redact sensitive data from audit events.
11. Record the actual outcome.

Treat tool descriptions, arguments, upstream responses, and server-provided metadata as untrusted input.

Protect against malformed requests, oversized payloads, path traversal, SSRF, command injection, confused-deputy behavior, and policy bypasses where relevant to the supported transport.

Never forward a request after a definitive deny.

If the policy service or audit subsystem fails, follow a documented, tested failure policy. For destructive or high-risk actions, fail closed when the adapter can reliably prevent execution. Do not silently claim protection if the adapter cannot guarantee that behavior.

## 6. Human Approval

For sensitive operations:

- Present the requested action and relevant arguments safely.
- Explain why approval is required.
- Identify the requesting agent and target resource where known.
- Redact credentials and sensitive payloads.
- Bind approval to the specific request, policy version, and expiry.
- Reject expired, reused, or mismatched approvals.
- Record who approved the action and the final outcome where identity is available.

Approval must not grant indefinite or unrelated permissions.

Avoid automatic approval loops and ambiguous approval states.

## 7. Policy Simulation and Dry Run

Implement a dry-run mode that evaluates policies without blocking the request.

For each simulation, record:

- The proposed policy change.
- The affected entities and tools.
- The observed or representative request.
- The predicted verdict.
- The rule explanation.
- The difference from current behavior.
- The uncertainty and coverage limitations.

Dry-run results must never be presented as enforced outcomes.

Simulate policy changes against saved fixtures or captured, redacted events without executing dangerous actions.

## 8. Safe Activation and Rollback

Before activating enforcement:

1. Validate the configuration.
2. Explain the impact and known limitations.
3. Create a recoverable backup of the relevant AgentRadius-managed configuration.
4. Confirm that the enforcement adapter is healthy.
5. Require explicit user consent.
6. Activate the policy through the supported mechanism.
7. Verify that permitted requests work and denied requests are blocked.
8. Record the activation and expose a rollback path.

Never silently rewrite a third-party client's configuration.

If an integration requires changing its configuration, preview the exact diff and obtain explicit approval.

Do not revoke credentials, modify OS privacy settings, or delete external resources as an implicit consequence of a policy edit.

Support an emergency disable or rollback mechanism that does not require the entire dashboard to remain healthy.

## 9. Audit and Observability

Record structured events for:

- Policy decisions.
- Enforcement results.
- Approval requests and outcomes.
- Policy changes.
- Adapter health.
- Configuration changes.
- Failed forwarding attempts.
- Rollbacks and emergency stops.

Where possible, distinguish a decision from its enforcement outcome.

Include correlation IDs, timestamps, policy versions, adapter identity, and safe reason codes.

Do not log secrets, authorization headers, complete tokens, or sensitive tool arguments.

Make audit-storage failure visible. If audit durability is required for a high-risk action, prevent that action when safe and technically possible.

Do not claim tamper-proof logging unless the implementation actually provides and tests tamper-evidence guarantees.

## 10. Control Coverage

For every integration, maintain an explicit control-coverage record:

- Which traffic is mediated.
- Which clients and transports are supported.
- Whether all requests pass through the adapter.
- Whether alternative direct connections remain possible.
- Whether response inspection is supported.
- Whether approval is enforced before execution.
- Which bypass scenarios remain.
- How enforcement is tested.

Show these limitations in the UI.

An MCP gateway does not automatically control an agent's direct shell access, browser access, operating-system permissions, or separate API clients.

Do not imply system-wide protection from a control that covers only one transport.

## 11. Testing Requirements

Use a fake upstream server and deterministic policy fixtures.

Verify:

- Permitted requests reach the upstream server.
- Denied requests never reach the upstream server.
- Approval-required requests wait for a valid approval.
- Expired approvals are rejected.
- Malformed requests are rejected safely.
- Policy conflicts resolve according to documented precedence.
- Policy-engine failures follow the configured safe behavior.
- Audit events redact secrets.
- Dry-run mode does not block requests.
- Enforce mode produces verified enforcement outcomes.
- Configuration changes can be rolled back.
- Direct, unmediated connections are not misrepresented as protected.
- Policy changes cannot silently disable the emergency recovery mechanism.

Test concurrent requests, upstream timeouts, restarts, stale policy versions, and partial failures.

## 12. Definition of Done

- [ ] Policy contracts and precedence are documented.
- [ ] Evaluation is deterministic and independently testable.
- [ ] Actual enforcement is verified at the relevant control point.
- [ ] Monitoring and enforcement states are distinct.
- [ ] Approval is scoped, expiring, and auditable.
- [ ] Secrets are redacted from logs and UI.
- [ ] Failures follow an explicit safety policy.
- [ ] Activation requires consent and supports rollback.
- [ ] Control coverage and bypass limitations are visible.
- [ ] Tests prove that denied requests do not reach the upstream operation.

The goal is enforceable, explainable security—not a dashboard that merely labels risky behavior.