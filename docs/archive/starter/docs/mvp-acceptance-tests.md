# MVP Acceptance Tests

## Graph ingestion
- [ ] Valid fixture imports with stable IDs and schema version.
- [ ] Duplicate ingestion is idempotent.
- [ ] Invalid entity/edge types are rejected with actionable errors.
- [ ] Secret-shaped fields are redacted or rejected.
- [ ] Every imported edge has provenance and a timestamp or an explicit unknown value.

## Reachability
- [ ] A root agent can be traced to a resource through a valid multi-edge path.
- [ ] Revoked edges are excluded.
- [ ] Inferred/stale edges are visible in the explanation.
- [ ] Conditional paths are labeled conditional if conditions are unresolved.
- [ ] Depth and result limits prevent unbounded traversal.

## Findings
- [ ] Rule output is deterministic for a fixed graph snapshot and rule version.
- [ ] Finding includes affected entities, path, evidence, confidence, rationale, and remediation.
- [ ] Severity and confidence are represented separately.
- [ ] Re-running analysis updates or resolves findings without duplicating them unnecessarily.

## Simulation
- [ ] Simulation does not modify persisted graph or external providers.
- [ ] Added permissions show newly reachable entities and actions.
- [ ] Removed permissions show reachability removed.
- [ ] Diff includes assumptions and confidence.

## UI/API/security
- [ ] Entity and edge details are keyboard accessible.
- [ ] Graph filters/search preserve a clear selected path.
- [ ] Connector errors are redacted and observable.
- [ ] Tenant isolation is tested at API and storage layers.
- [ ] Export is permission-checked and secrets are absent.
