# AgentRadius: working agreement for coding agents

Read this before changing anything. The detailed engineering skills live in `.claude/skills/<name>/SKILL.md`: modular engineering, macOS discovery, permission graph, and policy enforcement. The original starter spec is archived in `docs/archive/starter/` and is superseded.

## Non-negotiables

- **Read-only by default.** Do not add code that changes client configs, macOS settings, credentials, or provider state without an accepted ADR and the user's explicit approval. Enforcement is gated by [ADR 0007](docs/adr/0007-enforcement-strategy.md) (Proposed). Live discovery is gated by [ADR 0008](docs/adr/0008-read-only-macos-discovery.md), which is accepted only for the MCP client config connector; any new connector or new file location needs the user's approval and a line in `docs/macos-discovery-coverage.md`.
- **Connectors never execute what they find.** No starting MCP servers, running configured commands, or following paths from configs. Parser error messages must not be surfaced (they can quote file content).
- **Never persist, log, render, or echo secret values.** Store references only. Ingestion rejects secret-shaped data. Keep it that way, and add the new pattern to `src/redaction/secretPatterns.ts` whenever you add a credential type.
- **Never claim enforcement that has not been verified.** Only `enforced_verified` + `deny` may reduce blast radius. UI copy must say what is and is not monitored or blocked.
- **Fixture data must be labeled.** Any `dataOrigin: "fixture"` snapshot needs a `fixtureNotice`. Never commit realistic secret-looking literals. Build test sentinels at runtime (`tests/helpers/graphBuilder.ts`).
- **No TCC bypass.** Do not read `TCC.db`. Do not install privileged helpers.

## Engineering rules

- **Single source of truth.** Zod schemas live in `src/domain/`. Run `npm run schemas` after changing them; a test fails if `schemas/` drifts.
- **Module boundaries are enforced** by `tests/architecture.test.ts`. The UI imports only types from `api/contracts.ts` and runtime values from `domain/core.ts`.
- **Determinism.** Sort by ID, derive IDs from content, and use `asOf` instead of wall-clock time in analysis.
- **Analysis reads attributes only through `src/domain/attributeKeys.ts`.**
- **Update together:** when behavior changes, update schema, fixture, tests, and docs (including `docs/mvp-acceptance-tests.md`) in the same change.
- **Dependencies need a written justification** ([ADR 0002](docs/adr/0002-typescript-single-language-stack.md)).
- **Crypto:** SHA-256 and Ed25519 for integrity, AES-256-GCM for confidentiality. Never MD5, SHA-1, DES/3DES, RC4, or AES-CBC/ECB.
- **UI work** uses the vendored `.claude/skills/ui-ux-pro-max` skill (MIT, see its `SOURCE.md`) for design guidance. The tokens live at the top of `src/ui/styles.css`. Never load fonts, icons, or scripts from a CDN, because the CSP and the local-first rule forbid external requests. Never copy another product's UI code, assets, or branding; borrow general interaction patterns only.
- **Before finishing:** run `npm run check` and make sure it passes. That covers typecheck, oxlint, prettier, and all tests.

## Layout

```
src/domain        vocabulary, schema, edge semantics, attribute accessors, findings schema
src/redaction     secret pattern detection (locations only)
src/graph         ingest, merge, index, paths, deterministic traversal
src/analysis      blast radius, controls, findings rules, simulation, mitigations
src/fixtures      labeled synthetic snapshots
src/application   use cases (workspace service)
src/api           loopback HTTP server, contracts, request schemas
src/ui            React dashboard
tests/            architecture, schema drift, shared test helpers
docs/             architecture, ADRs, research, threat model, roadmap
```

`rea/` is an unrelated third-party project that is gitignored. Do not modify it.
