# 0011. Windows and Linux config locations, and a catalog of what MCP servers can do

**Status:** Accepted (2026-10-27). Approved by the user on 2026-10-27.

## Context

[ADR 0008](./0008-read-only-macos-discovery.md) covers reading MCP client configs on macOS. The user asked for the same on Windows and Linux. Users also found the map unhelpful: it showed which servers an agent connects to, but not what those servers can do, so most blast radius results were empty.

## Decision

- **Same connector, more locations.** The MCP config connector picks its file list by operating system (`src/connectors/mcpConfig/clients.ts`). Every path is still relative to the user's home folder and fixed in code:
  - Windows: `AppData/Roaming/Code/User/{mcp,settings}.json` and `AppData/Roaming/Claude/claude_desktop_config.json`. Install checks look in `AppData/Local/Programs/…` and `AppData/Local/AnthropicClaude/` for existence only.
  - Linux: `.config/Code/User/{mcp,settings}.json`. Claude Desktop has no Linux build, so it is skipped.
  - Cursor, Claude Code, and Windsurf use the same home-relative paths everywhere.
  - All the rules of ADR 0008 still apply: read-only, regular files under 1 MB, values discarded, nothing executed, and no parser messages surfaced.
- **Capability catalog.** `src/connectors/mcpConfig/capabilities.ts` lists what well-known servers typically offer:
  - SaaS servers (GitHub, Slack, Notion, and others) can read and write in that service.
  - Local servers: filesystem servers can read and write the folders in their arguments, shell servers can run commands as you, and git and SQLite servers can read and write.
  - These edges are always `inferred`, with rule `known-mcp-capabilities`, medium confidence for a package or host match and low for a name match.
  - Folder arguments are recorded as text. They are never opened or followed.
- **In-app assistants act as you.** A declared agent's default access is "whatever you can access", recorded as `inferred` (rule `in-app-ai-acts-as-user`). The user can narrow it to read only, or to read and write, which are recorded as `declared`.

## Consequences

- The Windows and Linux paths assume the default profile layout and have not yet been tested on a Windows or Linux machine. Redirected `%APPDATA%` folders are not found.
- The catalog can be wrong for a server that shares a name or package pattern with a known one. Because its edges are inferred, they can be excluded under Advanced analysis settings.
- What a token or account actually allows is still unknown until provider connections exist.
