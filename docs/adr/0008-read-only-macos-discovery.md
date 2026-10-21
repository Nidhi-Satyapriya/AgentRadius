# 0008. Read-only macOS discovery

**Status:** Accepted (2026-10-21) for the MCP client configuration connector only, approved by the user. Every other connector below is still Proposed and needs its own approval.

## Context

The user requires the following:

- Discovery must be read-only.
- It must not bypass TCC, SIP, sandboxing, or Keychain protections.
- It must never persist secrets.
- Scope, privileges, data handling, and rollback must be explicit before any real discovery runs.

None of the references has macOS-specific discovery ([research](../research/competitive-analysis.md)).

## Proposed decision

- **Each connector is a separate, consented unit.** It declares:
  - data categories;
  - exact paths or APIs it reads;
  - required privileges, each with a reason;
  - blind spots;
  - `readOnly: true`.

  These declarations are shown before the first run (`ConnectorRun` already carries the fields).

- **Names, never values:**
  - Environment variables are recorded by name.
  - Keychain items are recorded by service and account metadata, through APIs that do not return secret data.
  - 1Password and other vault references are recorded as the reference string.
  - Config files are parsed for structure, and secret-shaped values are dropped before graph construction. Ingestion would reject them anyway.
- **TCC.** AgentRadius does **not** open `TCC.db`. Reading it requires Full Disk Access, its format is undocumented, and the user prohibited bypassing TCC. Privacy-permission edges are collected only from:
  - (a) a configuration profile or MDM report the user exports, or
  - (b) user attestation.

  Otherwise they are `unknown`, and the `unknown-os-privacy-permission` finding explains why.

- **No privileged helpers, no `sudo`, no launch agents** are installed for discovery.
- **Network connectors** (GitHub, AWS, Google) are disabled by default. Each requires the user to connect an account explicitly, and that is a separate approval.
- **Data handling.**
  - Snapshots are held in memory.
  - If persistence is added, data goes under `~/Library/Application Support/AgentRadius/`, with 0700 permissions.
  - The user can delete it with one action.
  - Nothing is uploaded.
- **Rollback.** Discovery writes nothing outside AgentRadius's own data directory, so the only rollback needed is deleting that directory.

## Consequences

- Coverage is incomplete by design. The [coverage document](../macos-discovery-coverage.md) and each `ConnectorRun.blindSpots` make the gaps visible.
- The first real connector is MCP client configuration discovery (`src/connectors/mcpConfig/`). It needs no special privileges, and the value is high. It runs only when the user clicks **Scan this Mac**, reads a fixed list of files (see the [coverage document](../macos-discovery-coverage.md)), and keeps the result in memory until the API process exits.
