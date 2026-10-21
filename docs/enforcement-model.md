# Enforcement model

**Current state: AgentRadius enforces nothing.** It does not intercept, monitor, or block any traffic. `GET /api/v1/health` reports `"enforcementActive": false`, and every dashboard page says so.

This page defines the vocabulary AgentRadius already uses to describe _other_ systems' controls, and the planned design for its own enforcement ([ADR 0007](./adr/0007-enforcement-strategy.md), Proposed).

## Control states (implemented)

Every Policy node in the graph declares one of these states. Only the first can reduce blast radius.

| State               | Meaning                                                                                                          | Limits blast radius?             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `enforced_verified` | The execution path is intercepted, and blocking has been observed working                                        | **Yes**, if the effect is `deny` |
| `monitor_only`      | Traffic is observed and recorded, but not blocked                                                                | No                               |
| `advisory`          | Cooperative in-process hooks or guidance that the agent could bypass                                             | No                               |
| `external_declared` | Another system says a control exists (for example GitHub branch protection), and AgentRadius has not verified it | No                               |
| `not_enforceable`   | No interception point exists for this path                                                                       | No                               |

Controls that do not limit blast radius are still listed on each blast-radius result, with an explanation, so the user can see what exists and why it was not counted.

## Planned runtime design

### Verdicts

| Verdict            | When it applies                                                      | Effect in monitor mode          | Effect in enforce mode                                 |
| ------------------ | -------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| `ALLOW`            | A rule allows it                                                     | Forward and record              | Forward and record                                     |
| `DENY`             | A rule denies it, no rule matches (default), or the evaluator errors | Forward and record "would deny" | JSON-RPC error to the client; never reaches the server |
| `REQUIRE_APPROVAL` | A rule requires a human                                              | Forward and record "would ask"  | Hold until approved, denied, or expired                |
| `NOT_ENFORCEABLE`  | The message type or transport has no mediation point                 | Record                          | Record. **Never shown as blocked.**                    |

### Rollout per server

1. **Discovered.** Shown in the graph, with no runtime control.
2. **Monitor.** The user explicitly opts in. AgentRadius shows a preview of the config change and writes it only after consent, with a backup and health check. Calls are recorded with their would-be verdict.
3. **Dry-run review.** The user reviews what would have been denied over a period and adjusts policy.
4. **Enforce.** A separate explicit opt-in for each server. The control becomes `enforced_verified` only after the launch path is verified and a canary deny round-trip succeeds.
5. **Kill switch.** A single action reverts every wrapper to pass-through.
6. **Rollback.** Restores the byte-exact config backup.

### What will not be enforceable

These cases will be labeled `not_enforceable` in the UI, never implied to be covered:

- Remote HTTP/SSE MCP servers, until there is a separate design.
- An agent's built-in tools, such as native file or shell access inside the client.
- Servers launched outside the wrapped config entry.
- Use of a credential after it leaves the server process.

### Approvals

- Bound to SHA-256 over canonical JSON of (server identity, tool, arguments, policy version).
- Single use, with expiry.
- The broker is a loopback route that requires the session token.

### Audit

- Append-only JSONL with a SHA-256 chain.
- Arguments are stored as hashes. Secrets are never logged.
- In enforce mode, a failure to write the audit record means `DENY`.
- Limitation: a process running as the same user can delete the log. The audit chain shows tampering after the fact; it does not prevent it.
