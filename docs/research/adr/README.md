# Research ADRs

Architecture decisions informed by the research live with every other decision in [`docs/adr/`](../../adr/README.md), so there is one sequence of record.

The decisions most directly shaped by the reference projects are:

- [0004: Assertions, provenance, and findings](../../adr/0004-assertions-provenance-and-findings.md). Driven by the absence of any evidence model in the references.
- [0005: Traversal and propagation semantics](../../adr/0005-traversal-semantics.md).
- [0006: Loopback API security](../../adr/0006-loopback-api-security.md). Driven by the ressl dashboard's unauthenticated endpoints.
- [0007: Enforcement strategy](../../adr/0007-enforcement-strategy.md). Driven by ressl and AGT stdio proxies, AGT's in-process limits, and ScopeGate's documented onboarding and rollback.
- [0008: Read-only macOS discovery](../../adr/0008-read-only-macos-discovery.md). Driven by AGT's generic discovery and the absence of TCC handling anywhere.
