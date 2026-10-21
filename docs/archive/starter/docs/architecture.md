# Architecture

## Logical components
1. **Connector runtime** — invokes approved read-only adapters with scoped credentials, timeouts, rate limits, and structured errors.
2. **Normalization layer** — converts provider-specific payloads into canonical entities, capabilities, edges, and evidence records.
3. **Graph store** — persists nodes and edges with tenant/environment/source identifiers and collection timestamps.
4. **Analysis engine** — computes reachability, privilege paths, trust-boundary crossings, and rule-based findings.
5. **Simulation engine** — clones a graph snapshot, applies proposed changes in memory, reruns analyses, and returns a diff; never applies changes to external systems.
6. **API** — inventory, graph traversal, findings, connector configuration validation, simulation, and export endpoints.
7. **UI** — overview, graph explorer, findings, entity details, connectors, and simulations.

## Data flow
`Source config/API → Connector → Raw payload (ephemeral) → Normalizer → Canonical graph + evidence → Analysis → Findings → API/UI/export`

Raw payloads should be discarded or redacted unless retention is explicitly justified. Persist stable source IDs, safe metadata, and evidence references.

## Suggested service boundaries
- `connectors/`: adapter interface and provider-specific implementations.
- `domain/`: canonical models and invariants.
- `graph/`: graph queries and path explanations.
- `analysis/`: deterministic rules and severity scoring.
- `simulation/`: change proposals and graph diffs.
- `api/`: HTTP routes, auth, tenant isolation, rate limits.
- `web/`: frontend application.

## API outline
- `GET /api/v1/health`
- `GET /api/v1/inventory`
- `GET /api/v1/graph?root_id=...&depth=...&types=...`
- `GET /api/v1/entities/{entity_id}`
- `GET /api/v1/findings?severity=...&status=...`
- `POST /api/v1/connectors/{connector_id}/validate` — validate config; do not connect unless requested.
- `POST /api/v1/connectors/{connector_id}/sync` — explicit, audited read-only collection.
- `POST /api/v1/simulations` — analyze proposed changes on a copy.
- `GET /api/v1/simulations/{simulation_id}`
- `GET /api/v1/exports/graph.json`

## Security and reliability
- Authenticate all non-local deployments; enforce tenant/environment isolation in every query.
- Use least-privilege connector credentials and allowlisted egress.
- Redact tokens, passwords, private keys, cookies, and authorization headers at source and logging layers.
- Set timeouts, retry budgets, circuit breakers, and bounded concurrency per connector.
- Make sync idempotent and retain sync run metadata, errors, and source timestamps.
- Version schemas and support migrations for stored graph snapshots.
- Avoid evaluating connector-provided code or instructions; parse data as data.

## Graph semantics
An edge means a supported relationship, not necessarily a proven exploitable path. Effective reachability must account for edge status, conditional constraints, source freshness, and uncertainty. The MVP can provide conservative path estimates, but must label assumptions and avoid claiming authorization equivalence across vendors.
