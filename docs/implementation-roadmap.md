# Implementation roadmap

The work happens in small vertical slices. Each slice is inspected, implemented, tested, linted, typechecked, reviewed, and documented. Phases that touch the real machine or change state are gated on explicit user approval.

## Done (MVP, fixture data only)

| Slice              | What it delivers                                                                                                               | Evidence                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Research           | Six references pinned, discrepancies recorded, feature matrix                                                                  | [`docs/research/`](./research/)                                              |
| Canonical contract | Schema v2 (Zod), edge semantics, attribute accessors, generated JSON Schema                                                    | [ADR 0003](./adr/0003-canonical-schema-v2.md), `tests/schemas.test.ts`       |
| Ingestion          | Secret rejection, strict validation, merge with conflict recording, reference and rule checks                                  | `src/graph/ingest.test.ts`                                                   |
| Traversal          | Deterministic, gated BFS with limits and exclusion reasons                                                                     | [ADR 0005](./adr/0005-traversal-semantics.md), `src/graph/traversal.test.ts` |
| Analysis           | Blast radius, control semantics, 7 findings rules, simulation (remove-edge, add-edge, add-enforced-deny), measured mitigations | `src/analysis/**/*.test.ts`                                                  |
| API                | Hardened loopback HTTP server                                                                                                  | [ADR 0006](./adr/0006-loopback-api-security.md), `src/api/server.test.ts`    |
| Dashboard          | Nine pages, accessible SVG graph, fixture banner, honest "not available" states                                                | [ADR 0009](./adr/0009-custom-svg-graph.md), `src/ui/**/*.test.*`             |

## Next

### Phase A: harden before any live data (no approval needed; reversible)

1. Per-session API token, generated at startup and held in memory, required on all routes. Closes [threat T4](./threat-model.md).
2. A snapshot import endpoint and UI with a size cap (`MAX_SNAPSHOT_BYTES`), so users can load their own exported data. It is a mutating route, so it requires the token.
3. Selection kept stable while graph filters change (an acceptance-test gap).
4. `npm audit` plus a lockfile check in CI.

### Phase B: first read-only connector (needs approval: reads the user's home directory)

1. A `connectors/` module whose interface emits a `Snapshot` fragment plus a `ConnectorRun`.
2. **MCP client config connector.** Known paths only. It parses structure and drops secret-shaped values before graph construction. Tests run against a temporary fake home directory.
3. A consent screen that shows the paths, privileges, and blind spots before the first run.
4. Optional local persistence (an ADR is needed for SQLite under `~/Library/Application Support/AgentRadius`, 0700), plus one-click deletion.

### Phase C: more read-only connectors (approval per connector)

Installed apps, processes, credential references (names only), cloud CLI identities, and TCC from user export. The order and privileges are in [`macos-discovery-coverage.md`](./macos-discovery-coverage.md).

### Phase D: provider connectors (approval per account connection)

GitHub, AWS, and Google over read-only scopes, to turn `declared` edges into `observed` ones. Every scope is listed with its justification. These connectors are off by default.

### Phase E: monitor-only runtime (needs approval: changes client configuration)

The stdio wrapper in monitor mode, with config preview, consent, backup, health check, and rollback, plus tool-definition pinning, response redaction, and the SHA-256-chained audit log. See [ADR 0007](./adr/0007-enforcement-strategy.md).

### Phase F: enforcement (needs approval for each server)

Dry-run review, then enforce mode, approvals bound to action hashes, the kill switch, and `enforced_verified` labeling only after verifying the launch path and a canary deny.

## Open questions for the user

These are tracked here and asked explicitly; none of them blocks Phase A.

- Whether actions should imply each other in traversal, for example admin ⊇ write ([ADR 0005](./adr/0005-traversal-semantics.md)).
- Which MCP clients to support first in Phase B.
- Whether local persistence is wanted at all, or whether in-memory plus explicit export is enough.
