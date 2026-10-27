# macOS discovery coverage

**Current state: one live connector, MCP client configs, on macOS, Windows, and Linux** ([ADR 0011](./adr/0011-cross-platform-discovery-and-capability-catalog.md)). The dashboard starts empty. It reads this computer only when you click **Scan this computer**. Every other connector below is a proposal ([ADR 0008](./adr/0008-read-only-macos-discovery.md)) and needs the user's approval before it is built.

## Live: MCP client configuration connector

| Client         | Files read (relative to your home folder)                                                                     | Notes                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Cursor         | `.cursor/mcp.json`; `.cursor/plugins/cache/<marketplace>/<plugin>/<newest version>/.mcp.json` (or `mcp.json`) | Whether a cached plugin is currently enabled is not determined      |
| VS Code        | `Library/Application Support/Code/User/mcp.json`; the `mcp.servers` key of `…/Code/User/settings.json`        | Insiders builds are not read                                        |
| Claude Desktop | `Library/Application Support/Claude/claude_desktop_config.json`                                               |                                                                     |
| Claude Code    | `.claude.json`: only the `mcpServers` keys (user scope and per-project scope)                                 | Other keys in that file are parsed in memory but never read or kept |
| Windsurf       | `.codeium/windsurf/mcp_config.json`                                                                           |                                                                     |
| Codex          | `.codex/config.toml`: only the `[mcp_servers.<name>]` tables (approved by the user 2026-10-27)                | Read with a built-in TOML reader. `.codex/auth.json` is never read  |

Windows and Linux use these locations instead (all relative to the home folder; not yet tested on those systems):

| Client         | Windows                                                  | Linux                                            |
| -------------- | -------------------------------------------------------- | ------------------------------------------------ |
| Cursor         | same as macOS                                            | same as macOS                                    |
| VS Code        | `AppData/Roaming/Code/User/mcp.json` and `settings.json` | `.config/Code/User/mcp.json` and `settings.json` |
| Claude Desktop | `AppData/Roaming/Claude/claude_desktop_config.json`      | not available on Linux; skipped                  |
| Claude Code    | same as macOS                                            | same as macOS                                    |
| Windsurf       | same as macOS                                            | same as macOS                                    |
| Codex          | same as macOS                                            | same as macOS                                    |

- **What servers can do:** for recognized servers, read, write, and run-command access is inferred from a built-in catalog (`known-mcp-capabilities`). Filesystem servers are scoped to the folders listed in their arguments, which are recorded as text and never opened.
- **Collected:** server names, transport, command and arguments (secret-shaped values, secret flags, URL credentials, and query strings removed), remote host, package source and version pin, environment variable and header **names**, and where each credential value is stored: plain text, secret-manager reference, prompted input, environment, or key file.
- **Never collected:** environment variable values, header values, tokens, and any other key in these files.
- **Never done:** starting a server, running a configured command, following paths found in a config, or writing any file.
- **Reported failures:** missing file (reported as nothing found, not as a failure), permission denied (`requires_permission`), invalid JSON (`failed`, with no file content in the message), file over 1 MB, or a path that is not a regular file.
- **SaaS identification:** a remote host match counts as declared evidence. A package-name match is inferred (`known-mcp-package`, medium confidence), and a server-name match is inferred (`mcp-server-name-hint`, low confidence). A match shows where requests go, not what the server can do there.
- **Retention:** in memory only, replaced on rescan, and discarded when the API process exits.

Columns:

- **Can observe:** what the connector would read.
- **Privilege:** what macOS permission it needs.
- **Cannot see:** blind spots, which are reported in `ConnectorRun.blindSpots`.
- **Never stores:** values that are dropped before graph construction. Ingestion rejects them anyway.

## Live: account connections (network, opt-in per use)

These are not local discovery. They run only when you paste a read-only token, and they contact only the provider ([ADR 0012](./adr/0012-read-only-account-connections.md)).

| Provider | Can observe                                                                                   | Privilege                                        | Cannot see                                                                                                        | Never stores             |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------ |
| GitHub   | Repositories the fine-grained token can see, and your permission on each (read, write, admin) | A fine-grained token with only Metadata: read    | Org settings, teams, secrets, other people's access, repositories past the first 1,000                            | The token                |
| Notion   | Pages and databases shared with your internal integration, with their titles                  | An internal integration with only "Read content" | Pages not shared with the integration (Notion AI may still reach them), page contents, items past the first 1,000 | The token, page contents |

## Planned connectors, in build order

| Connector                                | Can observe                                                                                                                                                                                             | Privilege                                                                                                | Cannot see                                                                                                              | Never stores                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **MCP client configs** (live, see above) | Server entries in known config files for Claude Desktop, Cursor, VS Code, and similar clients: command, args, package source and version pin, env var **names**, remote URLs (with credentials removed) | None beyond the user's own home directory. Some paths may be inside app containers that require consent. | Project-level configs, configs at unknown paths, servers launched at runtime, enterprise-managed configs, exposed tools | Env var values, header values, tokens in URLs                |
| Installed applications                   | Bundle ID, name, version, code-signing team ID, from `/Applications` and `~/Applications`                                                                                                               | None                                                                                                     | Apps elsewhere, apps launched from disk images                                                                          | —                                                            |
| Running processes                        | Process name and path, parent, user, for agent-related binaries                                                                                                                                         | None for processes owned by the user                                                                     | Other users' processes, arguments of protected processes                                                                | Command-line arguments that match secret patterns            |
| Credential references                    | Env var names in shell profiles and `.env` files in user-selected project directories. 1Password and other vault URIs. Keychain item labels (service and account) through attribute-only queries.       | Keychain attribute queries may prompt the user                                                           | Items in other keychains; secrets held only in app memory                                                               | **All secret values**. Only names and references are stored. |
| Cloud CLI identities                     | Profile names, SSO start URLs, and role ARNs from `~/.aws/config` (not `credentials`), and `gcloud` and `gh` account names                                                                              | None                                                                                                     | Effective permissions. They need the provider API, which is a separate opt-in network connector.                        | Access keys, session tokens, refresh tokens                  |
| Privacy permissions (TCC)                | Grants **only** from (a) a configuration profile or MDM report the user exports, or (b) user attestation                                                                                                | None                                                                                                     | Anything not exported or attested. These grants stay `unknown`, and the dashboard explains why.                         | —                                                            |

## Explicitly not done

- **Reading `TCC.db`.** It needs Full Disk Access, its format is undocumented, and the user prohibited bypassing TCC.
- **Installing privileged helpers or launch daemons, or running anything with `sudo`.**
- **Reading secret values from Keychain, or decrypting browser cookie stores.**
- **Network calls to providers** (GitHub, AWS, Google) without an explicit account connection. That is a separate approval.

## How coverage is shown

Each connector run reports a status: `completed`, `partial`, `requires_permission`, `unsupported`, `failed`, `disabled`, or `not_implemented`. It also reports its coverage text and blind spots.

The Overview page lists every incomplete source as a coverage gap: "Missing data is not evidence that access is absent." The Integrations page shows each source's declared privileges and blind spots.

The demo fixture already models this, with these example statuses:

- AWS: `failed` (stale data).
- macOS privacy: `requires_permission`, with coverage "Not collected. Permissions are shown as unknown." and the blind spot "All TCC-controlled services".
- Runtime gateway: `not_implemented`.
