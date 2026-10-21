---
name: macos-security-discovery
description: Implement and review AgentRadius's local macOS inventory, application and process discovery, MCP configuration discovery, permission metadata collection, connector integrations, credential-reference handling, and privacy-preserving collection. Use whenever accessing or interpreting security-related information from the user's Mac.
---

# macOS Security Discovery

## Objective

Build a local-first discovery system that inventories relevant applications, developer tools, AI agents, MCP servers, authorization metadata, and accessible permission evidence on macOS.

The system must accurately report what it can observe, what requires authorization, and what remains unknown.

Follow the repository's `modular-engineering` skill at all times.

## 1. Core Principles

- Read-only discovery is the default.
- Request the minimum permissions required for each connector.
- Prefer documented operating-system APIs and supported provider APIs.
- Do not bypass macOS privacy controls, TCC, SIP, sandboxing, or Keychain protections.
- Do not silently elevate privileges.
- Never upload local inventory by default.
- Never collect or persist raw secrets merely to establish that a credential exists.
- Make collection scope, permissions, data retention, and limitations visible to the user.

## 2. Discovery Architecture

Use a connector-based architecture with a shared contract.

Each connector must declare:

- Stable connector ID and version.
- Supported macOS versions.
- Data categories collected.
- Collection method.
- Required permissions.
- Whether collection is read-only.
- Expected coverage.
- Known blind spots.
- Redaction behavior.
- Timeout and failure behavior.
- Test fixtures and verification method.

A connector must return normalized domain data, evidence metadata, and structured diagnostics.

Keep connector-specific parsing separate from the canonical graph model.

Do not make graph analysis depend directly on macOS filesystem paths or vendor-specific response formats.

## 3. Discovery Priorities

Implement incrementally.

### Priority A: MCP configuration discovery

Identify supported MCP configuration files and known locations used by installed AI clients.

For each discovered configuration:

- Record the owning application when identifiable.
- Identify server names, commands, arguments, environment-variable names, and transport types.
- Parse supported formats safely.
- Record file location and modification metadata where appropriate.
- Identify declared tools only when their definitions are available through a supported inspection mechanism.
- Distinguish configured servers from running servers.
- Record parsing errors without dumping sensitive contents.

Do not execute arbitrary commands found in a configuration simply to discover what they do.

Do not follow arbitrary executable paths or start servers automatically.

### Priority B: Applications and developer tools

Use supported macOS APIs and safe filesystem metadata to identify relevant applications and installed developer tools.

Where possible, correlate:

- Application identity.
- Executable path.
- Running process.
- Parent process.
- Declared bundle metadata.
- Known AI or developer-tool classification.

Do not infer that a process has a particular authorization merely because it is running.

### Priority C: macOS permission evidence

Where available through documented interfaces or explicitly authorized system reports, collect metadata concerning privacy permissions and application capabilities.

Potential categories include:

- Accessibility.
- Automation and Apple Events.
- Screen Recording.
- Full Disk Access.
- Camera and microphone.
- Files and folders.
- Location Services.
- Other supported privacy-protected capabilities.

Respect OS-version differences and authorization boundaries.

If a permission cannot be reliably inspected, return an explicit unknown or unsupported state. Never interpret missing data as a denied permission or as proof of safety.

Do not directly manipulate protected databases or bypass permission checks.

### Priority D: Credential references

Discover references to credentials without reading their secret values.

Examples include:

- Environment-variable names.
- Configuration keys referring to tokens.
- Credential-provider identifiers.
- Keychain item references when safely available.
- OAuth connection metadata.
- References to cloud profiles or service accounts.

Redact secret values at the earliest possible point.

Never print complete environment variables, tokens, passwords, private keys, cookies, or authorization headers.

Do not scan unrelated personal documents or browser data without explicit scope and consent.

Do not attempt to decrypt protected stores or extract credentials from other applications.

### Priority E: Authorized external integrations

Use explicitly configured and authorized APIs to inspect:

- OAuth grants and scopes.
- Cloud roles and policies.
- Identity-provider assignments.
- Application permissions.
- Integration status.
- Provider-side access controls.

Use read-only scopes whenever available.

Track the provider's identity, response timestamp, granted scopes, and data limitations.

Never claim that a provider-side scope is effective access without understanding relevant authorization and resource constraints.

## 4. Safe Collection Pipeline

Use this pipeline:

1. Determine whether the connector is enabled and authorized.
2. Validate the configured collection scope.
3. Collect only the declared categories of data.
4. Redact secrets and unnecessary personal information.
5. Normalize supported observations.
6. Attach provenance, timestamps, and collection status.
7. Validate the output against the canonical schema.
8. Persist only approved, minimized records.
9. Return a structured collection report.

A failed connector must not erase previously collected data silently.

Mark old observations stale when refresh fails and preserve their last successful collection time.

Make repeated scans idempotent.

## 5. Permissions and User Consent

Before requesting elevated access, explain:

- What information the connector reads.
- Why it needs the permission.
- Whether collection stays local.
- How long results are retained.
- How to disable the connector.
- What cannot be discovered without the permission.

Never bundle unrelated permissions into one vague request.

Do not change privacy settings or grant permissions automatically.

Use explicit opt-in for broader scans and external account connections.

## 6. Storage and Privacy

- Store local inventory in an appropriately protected application-data location.
- Use restrictive filesystem permissions where supported.
- Avoid persisting raw configuration files unless explicitly necessary.
- Store normalized metadata instead of complete source contents whenever possible.
- Redact secrets before logging, persistence, or UI rendering.
- Do not put sensitive paths or account identifiers in telemetry.
- Support deletion of collected inventory and clear retention rules.
- Make external data transmission explicit and opt-in.

Treat imported configuration, server metadata, and tool descriptions as untrusted input.

Do not execute imported scripts, commands, or configuration values.

## 7. Error Handling and Coverage

Every connector should report one of the appropriate states:

- Available.
- Running.
- Completed.
- Partially completed.
- Requires permission.
- Unsupported.
- Failed.
- Disabled.

Include structured error codes, safe diagnostics, collection timestamps, and coverage explanations.

Do not return a successful empty inventory after a failed scan.

Differentiate:

- No items found.
- No access to inspect items.
- Unsupported operating-system capability.
- Parse failure.
- Connector unavailable.
- Incomplete results.

## 8. Testing Requirements

Test:

- Malformed and oversized configuration files.
- Unexpected JSON and YAML structures where supported.
- Paths containing spaces and special characters.
- Symlinks and path traversal.
- Untrusted commands and arguments.
- Secret redaction.
- Permission denial.
- Missing files and changing files.
- Stale results after a failed refresh.
- Unsupported OS versions.
- Duplicate discoveries.
- External API failures and rate limits.
- Retention and deletion behavior.

Tests must use synthetic configurations and fake credentials. Never require real user secrets.

## 9. Definition of Done

- [ ] Collection is read-only unless an explicitly approved action says otherwise.
- [ ] Each connector declares its collection scope and privileges.
- [ ] No secrets are logged or persisted unnecessarily.
- [ ] Missing visibility is reported honestly.
- [ ] External data access is explicitly authorized.
- [ ] Failed scans do not masquerade as empty successful scans.
- [ ] Data has provenance, timestamps, and freshness status.
- [ ] Tests cover malformed input, redaction, and access-denied scenarios.
- [ ] Documentation explains coverage and limitations.

The goal is a trustworthy inventory, not a claim of omniscience. Unknown access must remain visible as unknown.