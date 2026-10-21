# Threat Model

## Assets
- Connector credentials and authorization tokens.
- Imported configuration and provider responses.
- Graph data revealing internal systems, resources, and trust relationships.
- Findings, simulations, exports, and audit records.

## Trust boundaries
- User/browser ↔ API.
- API ↔ database.
- Connector runtime ↔ external provider.
- Raw provider payload ↔ normalized domain objects.
- Tenant/environment ↔ other tenant/environment.
- Read-only collection ↔ any future write-capable operation.

## Threats and controls
| Threat | Control |
|---|---|
| Secret leakage in logs, graph, or exports | Central redaction, secret-reference-only model, tests with sentinel secrets |
| Malicious connector payload or prompt injection | Treat as untrusted data; no instruction execution; strict schemas and size limits |
| Cross-tenant data exposure | Tenant-scoped authorization at every query and storage boundary; isolation tests |
| Overprivileged connector | Least privilege, declared scopes, config review, explicit sync consent |
| False positive/negative reachability | Evidence provenance, confidence, unknown state, fixture-based evaluation |
| Stale graph treated as current | Freshness metadata, stale-edge labeling, configurable age thresholds |
| Dangerous future remediation | No write actions in MVP; future changes require approval, dry-run, audit trail, rollback plan |
| Graph/query denial of service | Depth and result limits, pagination, bounded traversal, timeouts |
| Export exfiltration | Authorization, redaction, export audit records, bounded file sizes |

## Security invariants
- Never persist secret values in canonical entities, edges, findings, or fixtures.
- Never silently elevate inferred edges to observed edges.
- Every sync is attributable to a user/service identity and has a run record.
- No external mutation occurs during analysis or simulation.
- Errors do not expose tokens, internal stack traces, or raw sensitive payloads to clients.
