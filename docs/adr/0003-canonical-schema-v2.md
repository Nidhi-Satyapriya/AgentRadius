# 0003. Canonical graph schema v2 with Zod as source of truth

**Status:** Accepted (2026-10-21)

## Context

The starter `graph.schema.json` (v1.0, snake_case) had several gaps:

- A single edge `status` that mixed evidence type, lifecycle, and staleness.
- No gating of edges that leave a resource.
- Controls (`HAS_POLICY`) with no enforcement state, so a declared policy could not be distinguished from a verified one.
- No way to tell fixture data from discovered data.

Separately maintained JSON Schema and TypeScript types would drift.

## Decision

- Define schema **v2.0** in `src/domain/schema.ts` using Zod. Generate `schemas/*.schema.json` from it (`npm run schemas`). A test fails if the committed files drift.
- Use camelCase field names, strict objects (unknown keys rejected), bounded strings and arrays, and attribute values limited to string, number, boolean, or string[].
- Rules enforced at ingestion:
  - Every node and edge has at least one provenance record.
  - `inferred` edges name their `inferenceRule`.
  - Fixture snapshots carry a `fixtureNotice`.
  - Policy nodes declare an `enforcementState`.
  - `CONTROLLED_BY` edges point to Policy nodes.
  - Propagating edges leaving a Resource declare `requiresAction`.
  - Snapshots may not contain `hypothetical` edges.
  - Secret-shaped values anywhere reject the whole snapshot.
- The starter v1 files, archived unmodified in `docs/archive/starter/`, stay untouched as historical input. The v1→v2 mapping is in [`docs/data-model.md`](../data-model.md).

## Consequences

- One definition drives validation, types, the API contract, and the published JSON Schema.
- Import errors carry JSON-pointer-like paths and never echo secret values.
- Changes to the vocabulary are breaking changes and need a schema version bump.
