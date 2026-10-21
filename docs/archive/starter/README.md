# AgentRadius

**Permission intelligence and blast-radius analysis for AI agents, MCP servers, integrations, and developer tooling.**

AgentRadius inventories identities and capabilities, represents relationships as a typed graph, and explains what an actor can reach or change. The MVP is read-only by default: it discovers and analyzes permissions but does not execute tools or mutate third-party systems.

## Core workflow
1. **Discover** connectors and imported configuration.
2. **Normalize** raw vendor permissions into a common capability model.
3. **Build** a permission graph with evidence and provenance.
4. **Analyze** effective access, privilege paths, and blast radius.
5. **Simulate** proposed permission changes without applying them.
6. **Review** findings, export reports, and track remediation.

## Repository map
- `docs/` product, architecture, threat model, graph model, and acceptance criteria.
- `schemas/` JSON Schema contracts for graph snapshots, connector manifests, and findings.
- `examples/` synthetic fixtures for local development and tests.
- `.claude/skills/` focused Claude Code instructions for implementing each subsystem.

## Suggested stack (replace as needed)
- API: Python + FastAPI; Pydantic models generated or validated against JSON Schema.
- Storage: PostgreSQL for durable entities/findings; optional graph projection or recursive SQL for MVP.
- UI: TypeScript + React; graph canvas plus searchable entity/finding panels.
- Connectors: isolated adapters with explicit scopes, timeouts, rate limits, and read-only defaults.
- Tests: pytest, contract fixtures, property-based graph tests, and frontend component tests.

## Safety principles
- Never store raw secrets in graph nodes, logs, findings, or exports.
- Store secret references and metadata only (provider, identifier, scopes, rotation date when available).
- Make every inferred edge distinguishable from a source-confirmed edge.
- Show evidence, collection time, and confidence for every material finding.
- Require explicit approval for any future write-capable integration.
- Treat imported configuration and connector responses as untrusted data.

## Local development sequence
1. Read `docs/product-spec.md` and `docs/architecture.md`.
2. Validate sample files against schemas in `schemas/`.
3. Implement graph normalization and deterministic analysis before adding live connectors.
4. Build a local fixture connector; only then add one read-only integration.
5. Implement findings UI and export; add simulations after baseline analysis is reliable.

## Status
Starter specification, not a production-ready security product. Validate vendor-specific semantics and threat assumptions before using with real environments.
