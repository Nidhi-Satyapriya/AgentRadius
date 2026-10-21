# 0004. Assertions, provenance, and findings

**Status:** Accepted (2026-10-21)

## Context

AgentRadius must distinguish what it **observed**, what was **declared** to it, what it **inferred**, and what it simply **does not know**. None of the reference projects model this ([research](../research/architecture-comparison.md#data-and-evidence-model)). Without it, a blast-radius result reads as certainty it does not have.

## Decision

1. Every edge carries an **assertion**:
   - `observed`: seen through a supported mechanism.
   - `declared`: stated by configuration or a provider, but not proven effective.
   - `inferred`: derived by a named rule.
   - `hypothetical`: introduced only by a simulation.
   - `unknown`: could not be established either way.
2. Every edge also carries a **confidence** (high, medium, or low), which is independent of the assertion.
3. **Freshness** is not stored. It is computed from the newest `provenance.observedAt` against an explicit `asOf` and a staleness threshold (default 72 hours).
4. **Conditions** on an edge have a state: holds, does_not_hold, or unresolved. Edges whose conditions do not hold are not followed. Unresolved conditions mark the path as conditional.
5. A path's assertion is its **weakest** step, and its confidence is its **lowest** step.
6. **Findings are conclusions, not facts.** They are produced by versioned rules from the graph and are never written back into it. Each finding has:
   - A stable ID, `finding:<rule>:<sorted affected ids>`.
   - Severity, which describes impact, kept separate from confidence, which describes evidence.
   - Rationale, assumptions, path, evidence references, and remediation.
   - `detectedAt = asOf`, so output is reproducible.
7. **Unknown is not denied.** Unknown edges are excluded from reachability by default, because the tool should not claim access it has no evidence for. They are still counted and surfaced as uncertainty, and the user can opt in to treating them as possible access.

## Consequences

- Every claim in the UI can show the provenance behind it.
- Re-running analysis on the same snapshot gives identical findings, with no duplicates.
- Analysis code reads attributes only through typed accessors (`domain/attributeKeys.ts`), so a typo cannot silently change results.
