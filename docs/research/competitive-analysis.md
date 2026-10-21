# Competitive analysis

Scope: what each reference does, how it does it, where it fails, and what that means for AgentRadius. Pinned commits and evidence labels are in [`source-register.md`](./source-register.md). File paths are relative to each repository root at its pinned commit.

## Summary

None of the six references does what AgentRadius is for. **None inventories a Mac, builds a permission graph, or computes blast radius across agents, MCP servers, credentials, and cloud resources.** Each covers a slice of the problem:

| Reference                | What it actually is                                                                         | Slice it covers                                        |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| ScopeGate (repo)         | Hosted gateway exposing one hand-written MCP server per connected SaaS account              | Least-privilege tool allowlists, OAuth token lifecycle |
| ScopeGate (website docs) | A local stdio gateway with vault, config migration, and rollback. **Source not available.** | Install/rollback UX, credential brokering              |
| Microsoft AGT            | Multi-language in-process governance libraries plus a spec (ACS)                            | Policy semantics, approvals, audit integrity, identity |
| ressl/mcp-firewall       | Python stdio wrapper proxy with a 7-stage pipeline (AGPL)                                   | Runtime interception and response redaction            |
| mukuna-web/mcp-firewall  | Small library decision core with no deployable proxy                                        | Default-deny rule evaluation, path and URL constraints |
| ScopeMantle              | Hosted OAuth-grant audit SaaS for Okta, Google, Entra, and Slack                            | Organization-level OAuth grant inventory               |
| AuthScope                | Headless-browser detector of a website's login vendor                                       | Signature and confidence design patterns only          |

The gap AgentRadius fills is **local, explainable reachability**. Its questions are: what is on this Mac, what can it reach, through which credentials, how sure are we, and what actually stops it.

---

## ScopeGate

### Repository (SRC-SG): hosted gateway

- **Model.** One `McpEndpoint` is bound to one `ServiceConnection` (a connected Gmail, Slack, GitHub, or similar account) and a set of `EndpointPermission` rows. Each row is a flat `provider:verb` string, about 385 in total. Tools not in the set are never registered, so they are absent from `tools/list` and cannot be called. This is default-deny by construction. (verified: `prisma/schema.prisma`, `src/lib/mcp/tools/index.ts`, `src/lib/mcp/handler.ts`)
- **Scopes stay broad upstream.** For example, Google is requested with `gmail.modify`, full `calendar`, and full `drive`. Narrowing happens at the proxy, so a server compromise exposes the full upstream scope. (verified: `src/lib/google-oauth.ts`)
- **Credentials.**
  - Tokens are encrypted with AES-256-GCM.
  - The single key is derived by PBKDF2 from `BETTER_AUTH_SECRET` with a static salt. The same secret also signs sessions and OAuth state. There is no rotation.
  - The endpoint bearer key is stored in plaintext and carried in the URL path, so it leaks into access logs.

  (verified: `src/lib/crypto.ts`, `src/lib/mcp/api-keys.ts`, `src/app/api/mcp/[apiKey]/route.ts`)

- **Failure modes.**
  - Rate limits and quotas fail open on DB errors.
  - Audit writes are best-effort and swallowed on failure.
  - Denied calls are not audited, which contradicts the docs.

  (verified: `route.ts`, `handler.ts`)

- **Good patterns.**
  - SSRF-hardened fetch that checks every resolved address and pins the IP (`src/lib/mcp/safe-fetch.ts`).
  - Automatic revocation of dead tokens after repeated failures (`src/lib/oauth-token-lifecycle.ts`).
  - Copy-paste client config snippets.
- **Missing:** graph, blast radius, stdio transport, local inventory, response filtering.

### Website docs (WEB-SG-SEC, WEB-SG-CLI): a different, local product

All points below are **documented** only. The code is not in the pinned repo.

- A local stdio gateway with a vault at `~/.scopegate/vault.enc` (AES-256-GCM; the master key lives in a 0600 file or the OS keychain). Configs hold only `secretRef` names.
- `scopegate init [--dry-run]` detects agent harnesses and rewrites their MCP configs behind the gateway. It moves plaintext secrets into the vault, writes `*.pre-scopegate.bak` backups, and can be undone with `scopegate rollback`.
- TTL capability grants. Agents may propose policy, but only into a pending file that a human approves. Hard ceilings ("limits") are fail-closed.
- A hash-chained audit log with Ed25519 signatures, where tool inputs are hashed rather than stored.
- Its own threat-boundary list is honest: "a malicious process running as your user can call the gateway like the agent does."

**Implication for AgentRadius.** These documented flows are the closest public description of safe enforcement onboarding: dry run, backup, rewrite, rollback. AgentRadius adopts the _requirements_ (see [ADR 0007](../adr/0007-enforcement-strategy.md)), not the implementation. It will never silently migrate secrets or rewrite configs.

---

## Microsoft Agent Governance Toolkit (SRC-AGT)

- **Enforcement is in-process and cooperative.** The docs state that the policy engine and agents share a process. The adapters "cannot prevent a host that saved the original object from calling it directly." (documented: `README.md`, `policy-engine/docs/adapter-mediation.md`)
- **ACS policy spec.** It is stateless and deterministic, using Rego or Cedar. Verdicts are `allow`, `deny`, and `transform`. Runtime errors yield deny, and conflicting definitions fail closed. Approvals are bound to a SHA-256 "enforced identity" of the exact action, so an approval cannot be replayed for a different call. (documented: `policy-engine/spec/SPECIFICATION.md`)
- **The legacy YAML engine has inconsistencies.** A Cedar error falls through to later stages and possibly to an allow default. With no policies loaded, the code denies, contradicting the docs. (verified: `agent-mesh/src/agentmesh/governance/policy.py`)
- **TypeScript `mcp-proxy`.**
  - It is the only true out-of-process stdio proxy in AGT.
  - It checks only `tools/call` and forwards server output unscanned.
  - Its built-in presets end in allow-all.

  (verified: `agent-mesh/packages/mcp-proxy/src/proxy.ts`, `policy.ts`)

- **Tool-definition scanning.** It detects hidden instructions, invisible unicode, rug pulls (changed definition fingerprints), and typosquats. (verified: `agent-os/src/agent_os/mcp_security.py`)
- **Audit.** A SHA-256 hash chain plus a Merkle tree with inclusion proofs. The file sink uses a keyed HMAC-SHA256 chain. The Claude Code plugin's chain is unkeyed and, by its own comment, recomputable by an attacker. (verified: `governance/audit.py`, `audit_backends.py`, `agent-governance-claude-code/lib/audit.mjs`)
- **Identity and delegation.** DIDs with Ed25519 keys. Delegation chains narrow capabilities, but signature checks are "best-effort" and skipped when the parent identity is unknown. (verified: `identity/delegation.py`)
- **Discovery.** `agent-discovery` runs `ps aux` with redaction and walks directories you supply for `mcp.json` and `claude_desktop_config.json`. It has no macOS-specific knowledge: no TCC, LaunchAgents, codesign, or Keychain. (verified: `agent-discovery/.../scanners/*.py`)
- **Blast radius** in AGT means counting an agent's dependent agents for cascade containment, not resource reachability. (verified: `agent-governance-typescript/src/cascade-containment.ts`)
- **Crypto flag.** The credential vault uses Fernet (AES-128-CBC with HMAC), which is deprecated under the workspace crypto rule.

**Implications for AgentRadius:**

- Adopt verdict semantics with fail-closed errors and approval binding to an action hash.
- Adopt tool-definition pinning.
- Treat in-process wrappers as **advisory**, never as "enforced".

---

## ressl/mcp-firewall (SRC-MFR, AGPL-3.0)

Behavior is described here; none of its code may be reused.

- **Insertion.** `mcp-firewall wrap -- <server cmd>` spawns the real server as a child and sits on its stdio. The user edits the client config by hand. (verified: `mcp_firewall/proxy/stdio.py`; documented: `README.md`)
- **Coverage.**
  - Only `tools/call` is inspected. `resources/read`, `prompts/get`, and server-initiated requests pass unchanged.
  - JSON-RPC batches are silently dropped.
  - A denied call returns error `-32000` and is never forwarded.

  (verified: `stdio.py`)

- **Pipeline.** Seven stages: kill switch, rate limit, injection regexes, egress check, threat feed, policy, then chain detector. The first deny wins. (verified: `pipeline/runner.py`)
- **Approval and defaults.**
  - The default action is `prompt`.
  - Approvals go through a loopback broker that requires a bearer token and an Origin check. Approvals are single-use and bound to a request hash.
  - With no broker, a zero-config `wrap` therefore denies every call. (verified + hypothesis: `models.py`, `human_approval.py`)
- **Response redaction.** Secret regexes are on by default; PII scanning is opt-in. Walking fails closed on deep or cyclic payloads. (verified: `pipeline/outbound/*`)
- **Audit.** A SHA-256-chained JSONL log with optional Ed25519 signing. The signing key is generated and stored unencrypted on the same host, so it does not protect against attackers running as the same user. (verified: `audit/logger.py`, `audit/signer.py`)
- **Weaknesses.**
  - Agent identity comes from `clientInfo.name`, which the client controls, so it can be spoofed.
  - Argument rules match exact key names, and paths are never canonicalized.
  - There is a DNS-rebinding race between the egress check and the server's own resolution.
  - Dashboard event endpoints have no authentication.
  - There is no tool pinning.

  (verified)

**Implications for AgentRadius:**

- A stdio wrapper is the most realistic first enforcement point.
- It must cover every method, or label unhandled ones `NOT_ENFORCEABLE`.
- It must handle batches explicitly.
- It must never trust self-reported client identity for authorization.
- Its local API must be authenticated.

## mukuna-web/mcp-firewall (SRC-MFM)

- **What it is.** A pure-stdlib library: `proxy_stream()` evaluates JSONL messages against a TOML policy and calls a caller-supplied upstream function. It does not spawn processes and has no transport, so it cannot be put in a real client's path as shipped. (verified: `src/mcp_firewall/proxy.py`, `cli.py`; documented: `README.md`)
- **Policy.**
  - Default deny, with exact tool names.
  - `path_roots` is canonicalized but checked only on an argument literally named `path`.
  - `url_domains` and `deny_private_networks` are checked only on `url`.
  - Integer-form IPs bypass `deny_private_networks` when no domain list is set.

  (verified: `engine.py`, `detectors.py`)

- **Audit.** A SHA-256 chain from a fixed genesis value that refuses to append to a broken chain. The README admits that deleting or replacing the whole log goes undetected. (verified: `audit.py`; documented)

**Implication for AgentRadius.** Argument constraints must be schema-aware, using the tool's declared input schema, not argument names.

---

## ScopeMantle (WEB-SM-SEC)

Everything below is **observed** on the vendor's public security page. No code is available.

- A hosted, multi-tenant SaaS for organization OAuth-grant audit. It reads Okta, Google Workspace, Entra, and Slack over read-only OAuth scopes, then streams normalized events to a SIEM.
- **A per-integration scope table** lists every requested scope with the operational reason for it. Write scopes are opt-in per tenant.
- **Credentials are write-only at the API.** No endpoint returns a stored secret, and health checks return a redacted fingerprint.
- **Claims we cannot verify:**
  - AES-GCM with quarterly KEK rotation.
  - SSRF blocking of RFC 1918 ranges and metadata endpoints.
  - "SOC 2 Type II in progress."
- **Hypothesis:** the published PGP fingerprint ends in `0000 0000`, which looks like a placeholder. That is a reason not to rely on the page as authoritative.

**Implications for AgentRadius:**

- Connector manifests must list each scope or privilege with its justification, as a manifest field, not prose.
- Secrets are write-only, and only references are ever returned.
- ScopeMantle shows the organization-side view of OAuth grants. AgentRadius shows the device-side view: which local agent holds which grant.

## AuthScope (SRC-AS)

- **What it is.** A Playwright scanner that loads a website's login page and reports which auth vendor powers it, along with posture and anti-bot difficulty. It is not credential discovery. (verified)
- **Patterns worth adopting:**
  - Declarative YAML signatures with a definition hash.
  - Per-signal evidence.
  - Confidence that rises with independent corroborating signals.
  - "Specific beats generic" conflict resolution.
  - Per-signature false-positive feedback.
  - Fault-isolated detectors with timeouts.

  (verified: `engine/detectors/base.py`, `pipeline/aggregator.py`, `api/routes/feedback.py`)

- **Patterns to avoid:**
  - Cookie values and full `Authorization`/`Cookie` headers stored in HAR files and reports.
  - Redaction that covers only JWT-shaped strings.
  - Stored response bodies.
  - Unanchored substring signatures (`"ping"`).
  - An SSRF guard that checks only the initial host.

  (verified: `engine/page/controller.py`, `static_analyzer.py`, `api/urls.py`)

**Implication for AgentRadius.** Discovery records **names, never values**, the way AuthScope matches cookie names. Connector confidence follows corroboration.

---

## Positioning

| Question                                                     | Closest reference                                    | AgentRadius answer                                                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What agents, MCP servers, and credentials exist on this Mac? | AGT `agent-discovery` (generic `ps` and config walk) | macOS-aware read-only connectors with explicit coverage and blind spots ([coverage doc](../macos-discovery-coverage.md))                                         |
| What can a compromised agent reach?                          | none                                                 | Deterministic, explainable blast radius with an evidence label on every path step                                                                                |
| How sure are we?                                             | AuthScope (confidence from corroboration)            | Assertion (observed, declared, inferred, unknown), confidence, and freshness on every edge                                                                       |
| What actually stops it?                                      | ressl and AGT proxies                                | Controls are labeled `enforced_verified`, `monitor_only`, `advisory`, `external_declared`, or `not_enforceable`. Only verified enforcement reduces blast radius. |
| What if I change something?                                  | none                                                 | In-memory simulation with a before/after diff. Mitigations are measured, never auto-applied.                                                                     |
