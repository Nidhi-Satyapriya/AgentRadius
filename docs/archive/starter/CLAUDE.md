# AgentRadius project instructions

- Read `README.md`, `docs/product-spec.md`, and `docs/architecture.md` before major changes.
- Follow the relevant skill in `.claude/skills/` for the subsystem being edited.
- Keep the MVP read-only. Do not add external write actions without an explicit product decision and threat-model update.
- Never persist secret values. Keep provenance, freshness, confidence, and uncertainty visible.
- Update schemas, fixtures, docs, and acceptance tests together when contracts change.
- Prefer deterministic, explainable analysis over opaque heuristics.
