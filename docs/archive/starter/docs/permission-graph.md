# Permission Graph Model

## Node types
- `agent`: AI agent or automation principal.
- `identity`: human, service account, workload identity, or role.
- `mcp_server`: MCP server instance and its trust boundary.
- `tool`: callable tool exposed by an agent or MCP server.
- `integration`: SaaS/cloud/developer-system integration.
- `credential_ref`: reference to a credential; never the secret value.
- `resource`: repository, bucket, database, project, workspace, or other protected object.
- `action`: normalized operation such as `read`, `write`, `delete`, `admin`, `execute`.
- `trust_boundary`: environment or administrative boundary.
- `policy`: permission grant, policy, role binding, or scope set.

## Edge types
- `USES_IDENTITY`, `CONNECTS_TO`, `EXPOSES_TOOL`, `AUTHENTICATES_WITH`, `HAS_POLICY`, `GRANTS_ACTION`, `CAN_ACCESS`, `RUNS_IN`, `CROSSES_BOUNDARY`, `OWNS`, `DERIVED_FROM`.

## Edge evidence
Each edge should include: `source_id`, `observed_at`, `method`, `evidence_ref`, `confidence`, `status`, and optional `conditions`. `status` is one of `observed`, `inferred`, `stale`, `unknown`, or `revoked`.

## Reachability semantics
A path is a sequence of valid edges from a root principal/agent to a resource or action. Exclude revoked edges. Flag stale and inferred edges in path explanations. Conditional edges should only be treated as reachable when the condition is known to hold; otherwise label reachability as conditional/unknown.

## Permission debt indicators
- Broad wildcard scopes or administrator-equivalent grants.
- Unused or unowned credential references.
- Tool capability broader than its documented task.
- Paths that cross trust boundaries without an explicit policy edge.
- Long-lived grants, stale observations, or missing expiry/rotation metadata.
- Duplicate or overlapping grants that obscure effective access.

## Confidence guidance
- `high`: directly observed in authoritative source response/config.
- `medium`: deterministic derivation from observed records, with assumptions disclosed.
- `low`: heuristic, incomplete inventory, ambiguous mapping, or stale data.

Confidence is not severity. A severe potential path may have low confidence and should be displayed as such.
