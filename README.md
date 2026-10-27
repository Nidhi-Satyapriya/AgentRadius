# AgentRadius

A local-first security tool for your Mac. It shows **what each AI agent can reach** (through which MCP servers, credentials, and cloud roles), **how sure it is**, and **what actually stops it**.

> **Current state: read-only.** The dashboard opens on a labeled synthetic workstation. Click **Scan this Mac** to read your MCP client configs (Cursor, VS Code, Claude Desktop, Claude Code, Windsurf); values of environment variables and headers are discarded while reading, and the result stays in memory. Account permissions (GitHub, AWS, Atlassian, and others) are not collected yet, and AgentRadius does not monitor or block any traffic. See [discovery coverage](docs/macos-discovery-coverage.md) and the [roadmap](docs/implementation-roadmap.md).

## Quick start

Requires Node 24 or later.

```sh
npm install
npm run dev          # API on http://127.0.0.1:4317, UI on http://127.0.0.1:5173
```

Production-style:

```sh
npm run build && npm start   # UI and API on http://127.0.0.1:4317
```

Quality gate (typecheck, lint, format, all tests):

```sh
npm run check
```

## What you can do today

The sidebar has five areas: Overview, Integrations, Permission Graph, Blast Radius, and Remediation. Activity log and Settings sit below them.

- **Overview.** Counts, the findings that need attention, and how much the sources can't see.
- **Integrations.** One searchable table of every source, with status, access method, last sync, items found, and risk. Select a row for what it read, what access it needed, its blind spots, and any errors with the next step. Add agents that discovery cannot see, such as Atlassian Rovo, Gemini in Gmail, Notion AI, Slack AI, or a custom bot. They are analyzed like discovered agents, labeled as declared by you, and kept in memory only. Account sign-in (GitHub, Atlassian, Google, and others) is listed as not available, never as connected.
- **Permission Graph.** Graph, relationship list, and direct-permission views. Filter by source, findings, type, and evidence. Zoom, pan, fit, and reset, all with keyboard support. Line style shows whether a relationship was observed, declared, inferred, or is unknown. Links from findings open with the evidence path highlighted.
- **Blast Radius.** Pick an entity, assume it is compromised, and get a one-sentence summary and the resources it could read, change, delete, run, or administer. Each row expands to its path or opens it in the graph. Ways to reduce exposure are measured on an in-memory copy and can be previewed. Analysis settings, what-if grants, controls, and relationships that weren't followed are under Advanced analysis. A comparison view shows every agent against every resource.
- **Remediation.** Findings ranked by severity, each with what's affected, the evidence path, the recommended action, and a dry-run preview. AgentRadius cannot change provider settings. Make the change where access is granted, then sync. The Activity log shows how many findings each sync resolved.
- **Activity log and Settings.** What was done this session (in memory only), analysis defaults, data handling, and the controls your sources recorded. There is no policy engine, and nothing is blocked.

## Principles

- **Evidence first.** Every fact has provenance. Unknown is not treated as denied, and inferred is not treated as observed.
- **Reachability is not exploitability.** Results state their assumption and say what they do not prove.
- **Only verified enforcement counts.** Monitor-only, advisory, and externally declared controls are shown, but they never shrink blast radius.
- **No secrets, ever.** Data containing secret-shaped values is rejected at ingestion. AgentRadius records names and references, never values.
- **Local only.** It binds to `127.0.0.1`, hardened against DNS rebinding and CSRF. There is no telemetry and nothing is uploaded.

## Documentation

| Topic                       | Document                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Architecture and modules    | [docs/architecture.md](docs/architecture.md)                                                   |
| Data model (schema v2)      | [docs/data-model.md](docs/data-model.md)                                                       |
| Threat model                | [docs/threat-model.md](docs/threat-model.md)                                                   |
| Enforcement model           | [docs/enforcement-model.md](docs/enforcement-model.md)                                         |
| macOS discovery coverage    | [docs/macos-discovery-coverage.md](docs/macos-discovery-coverage.md)                           |
| Acceptance criteria → tests | [docs/mvp-acceptance-tests.md](docs/mvp-acceptance-tests.md)                                   |
| Roadmap                     | [docs/implementation-roadmap.md](docs/implementation-roadmap.md)                               |
| Decisions                   | [docs/adr/](docs/adr/README.md)                                                                |
| Competitive research        | [docs/competitive-analysis.md](docs/competitive-analysis.md), [docs/research/](docs/research/) |
