# AgentRadius

A local-first security tool for your Mac. It shows **what each AI agent can reach** (through which MCP servers, credentials, and cloud roles), **how sure it is**, and **what actually stops it**.

> **Current state: read-only.** The dashboard starts empty and never shows sample data. Add the agents you use, then click **Scan this Mac** to read your MCP client configs (Cursor, VS Code, Claude Desktop, Claude Code, Windsurf); values of environment variables and headers are discarded while reading, and the result stays in memory. Account permissions (GitHub, AWS, Atlassian, and others) are not collected yet, and AgentRadius does not monitor or block any traffic. See [discovery coverage](docs/macos-discovery-coverage.md) and the [roadmap](docs/implementation-roadmap.md).

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

### Optional: sign in with Google

Sign-in only identifies you (name and email). It requests no access to Gmail, Drive, or any other Google data, and no Google token is kept. See [ADR 0010](docs/adr/0010-optional-google-sign-in.md).

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Add the authorized redirect URI `http://127.0.0.1:4317/api/v1/auth/google/callback`.
3. Start AgentRadius with the client ID and secret in its environment. Don't commit them.

   ```sh
   export AGENTRADIUS_GOOGLE_CLIENT_ID="<client id>"
   export AGENTRADIUS_GOOGLE_CLIENT_SECRET="<client secret>"
   npm run dev   # or: npm run build && npm start
   ```

Without these variables, sign-in shows as not set up and everything else works.

Quality gate (typecheck, lint, format, all tests):

```sh
npm run check
```

## What you can do today

The top bar has five areas: Overview, Integrations, Permission Graph, Blast Radius, and Remediation. Activity log, Settings, the scan status, and sign-in sit on the right.

- **Overview.** What AgentRadius does, a "get started" checklist (sign in, add agents, scan, see the map, remediate), and, once there is data, counts and the findings that need attention.
- **Integrations.** Add agents one by one from a catalog (Atlassian Rovo, Gemini in Google Workspace, Microsoft 365 Copilot, Notion AI, Slack AI, GitHub Copilot, and others) or as a custom agent. Then scan this Mac. Only what you add or scan is listed, with status, access method, last sync, items found, and risk. Added agents are labeled as declared by you and kept in memory only.
- **Permission Graph.** Opens right after a scan. A strip explains how to read it (agents → servers and tools → credentials → your data). Graph, relationship list, and direct-permission views, with filters, zoom, pan, and keyboard support. Under the graph, each agent's blast radius is summarized, followed by a link to remediate the findings.
- **Blast Radius.** Pick an entity, assume it is compromised, and get a one-sentence summary and the resources it could read, change, delete, run, or administer. Each row expands to its path or opens it in the graph. Ways to reduce exposure are measured on an in-memory copy and can be previewed. The page ends with a link to Remediation.
- **Remediation.** Findings ranked by severity, each with what's affected, the evidence path, the recommended action, and a dry-run preview. AgentRadius cannot change provider settings. Make the change where access is granted, then scan again. The Activity log shows how many findings each scan resolved.
- **Activity log and Settings.** What was done this session (in memory only), sign-in setup, analysis defaults, data handling, and the controls your sources recorded. There is no policy engine, and nothing is blocked.

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
