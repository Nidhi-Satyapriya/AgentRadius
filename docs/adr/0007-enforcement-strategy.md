# 0007. Enforcement strategy

**Status:** Proposed. Requires explicit user approval before any implementation that changes client configuration or intercepts traffic.

## Context

The user requires the following:

- Monitor-only first.
- Enforcement only through an explicit user action, with backups, rollback, and health checks.
- No silent configuration rewrites.
- No claim that something is blocked unless the execution path is actually intercepted and the blocking has been verified.

The research shows three enforcement shapes:

- **In-process** (AGT): cooperative and bypassable.
- **Stdio wrapper** (ressl, the AGT TS proxy): real, but only if the client launches the wrapper.
- **Hosted gateway** (ScopeGate): moves credentials off the device.

See [architecture comparison](../research/architecture-comparison.md).

## Proposed decision

1. **Mechanism: a per-server stdio wrapper.** `agentradius-proxy -- <original command>` spawns the real server and mediates JSON-RPC on stdio.
   - It handles **every** method:
     - `tools/call` is evaluated.
     - `tools/list` is pinned (tool-definition hashes).
     - `resources/read` and `prompts/get` are evaluated or labeled `NOT_ENFORCEABLE` per policy.
     - Batches are unpacked and evaluated per element.
     - Server-initiated requests are logged.
   - Tool results are redacted with the shared secret patterns.
2. **Verdicts:** `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, `NOT_ENFORCEABLE`. Evaluator errors produce `DENY` in enforce mode.
3. **Modes, progressing per server:**
   - **monitor**: forward everything and record the would-be verdict.
   - **dry-run**: show which calls would have been denied over a window.
   - **enforce**: only after the user explicitly opts in.
4. **Approvals** are bound to SHA-256 over canonical JSON of (server identity, tool, arguments, policy version). They are single-use and expire. The approval broker is a loopback route that requires the session token from [ADR 0006](./0006-loopback-api-security.md).
5. **Identity** is the wrapper instance, meaning the config entry that launched it. It is never the client's self-reported `clientInfo.name`.
6. **Onboarding** for each server, each step needing user action:
   1. Preview the exact config diff.
   2. User consent.
   3. Timestamped byte-exact backup.
   4. Write.
   5. Health check: the wrapper starts, the server answers `initialize`, and `tools/list` matches the previous result.
   6. On failure, automatic restore.

   One-step rollback is always available. AgentRadius never moves secrets out of a config on its own.

7. **Verification before labeling.** A server's control is labeled `enforced_verified` only after AgentRadius confirms all of the following:
   - (a) The client config launches the wrapper.
   - (b) No other config entry launches the same server directly.
   - (c) A canary deny round-trip was observed for that server.

   Otherwise the label is `monitor_only` or `not_enforceable`.

8. **Kill switch.** A single action returns every wrapper to pass-through, with an audit record.
9. **Audit.** SHA-256-chained JSONL. Arguments are hashed. In enforce mode, an audit write failure means `DENY`.

## What this cannot enforce

The UI must say this. The wrapper does not cover:

- Remote (HTTP/SSE) MCP servers. The UI labels them `not_enforceable` until an HTTP mediation design exists.
- An agent's built-in tools, such as a client's native file or shell access.
- Anything another process launches outside the wrapped config.
- Actions taken through a credential after it leaves the server (for example, a token used directly against GitHub).

## Consequences

- Enforcement is per server, opt-in, and reversible.
- Blast radius only shrinks for servers whose enforcement is verified.
