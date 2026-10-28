# MCPRadius

A local-first MCP permission tool. It shows what configured MCP clients and supported in-app agents can read, change, or run from this computer.

> **Scope:** MCPRadius reads local MCP configuration and, only when you opt in, GitHub or Notion account access with a one-time read-only token. It does not monitor, block, or change anything. See [ADR 0013](docs/adr/0013-mcpradius-scope.md).

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
3. Start MCPRadius with the client ID and secret in its environment. Don't commit them.

   ```sh
   export MCPRADIUS_GOOGLE_CLIENT_ID="<client id>"
   export MCPRADIUS_GOOGLE_CLIENT_SECRET="<client secret>"
   npm run dev   # or: npm run build && npm start
   ```

Without these variables, sign-in shows as not set up and everything else works.

Quality gate (typecheck, lint, format, all tests):

```sh
npm run check
```

## What you can do today

The top bar has five areas: Overview, Integrations, Permission Graph, Blast Radius, and Remediation. Settings, the scan status, and sign-in sit on the right.

- **Overview.** Scope, setup checklist, and results.
- **Integrations.** Configure GitHub or Notion with a one-time read-only token; track GitHub Copilot or Notion AI; scan local MCP configuration. Account tokens are used for one read, then dropped ([ADR 0012](docs/adr/0012-read-only-account-connections.md)). Only GitHub and Notion appear as account integrations until another provider has a verified reader.
- **Permission Graph.** Opens right after a scan. A strip explains how to read it (agents → servers and tools → credentials → your data). Graph, relationship list, and direct-permission views, with filters, zoom, pan, and keyboard support. Under the graph, each agent's blast radius is summarized, followed by a link to remediate the findings.
- **Blast Radius.** Riskiest agents are ranked first. Pick one and see its reach in three boxes: can delete, run, or administer; can change; can read. Each resource shows a short chain of how it is reached, with details and graph links. Fix-first cards preview how much each change shrinks reach. When nothing is reachable, the page says why. Analysis settings and what-if grants are under Advanced.
- **Remediation.** Findings ranked by severity, evidence path, recommended change, and dry-run preview. MCPRadius cannot change provider settings.
- **Settings.** Sign-in setup, analysis defaults, data handling, and the controls your sources recorded. There is no policy engine, and nothing is blocked.

## Principles

- **Evidence first.** Every fact has provenance. Unknown is not treated as denied, and inferred is not treated as observed.
- **Reachability is not exploitability.** Results state their assumption and say what they do not prove.
- **Only verified enforcement counts.** Monitor-only, advisory, and externally declared controls are shown, but they never shrink blast radius.
- **No secrets, ever.** Data containing secret-shaped values is rejected at ingestion. MCPRadius records names and references, never values.
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
