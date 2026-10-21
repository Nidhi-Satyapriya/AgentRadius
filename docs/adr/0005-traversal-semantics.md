# 0005. Traversal and propagation semantics

**Status:** Accepted (2026-10-21)

## Context

A blast-radius engine that simply follows every edge overstates reach. For example, it would let anyone who can read a repository assume the role its CI deploys with. A path-finding library would also hide the reasoning. The engine has to explain every step and every step it refused to take.

## Decision

- **Each edge type declares how compromise propagates** (`domain/edgeSemantics.ts`):
  - `forward` for most edges.
  - `reverse` for `TRUSTS`: compromising the trusted side affects the truster.
  - `none` for `CONTROLLED_BY`, which is metadata.
  - `CAN_*` edges grant an action on their target.
- **Agent ≠ process.** An Application `RUNS_AS` the user and `HOSTS` the Agent. An agent reaches only what its connections and tools give it, not everything the user can do.
- **Gated edges.** An edge with `requiresAction` is followed only after the traversal holds **exactly that action** on the edge's source. The witness path is the one that obtained the access. When a node later gains new access, the traversal revisits it so newly unlocked gated edges are found. This is a worklist BFS that re-enqueues nodes.
  - Actions do not imply each other yet: `admin` does not satisfy a `write` gate. That errs toward under-reporting. Whether to add an implication order (admin ⊇ write ⊇ read) is an open question, because it depends on each provider's real semantics. Connectors should emit every action they observe.
- **Deterministic ordering.** Candidate edges are sorted by confidence, then by ID, and results by path length, then by ID. Reversed input order produces identical output (this is tested).
- **Limits.** `maxDepth` (default 10, at most 25) and `maxReached` (default 5,000). Hitting either sets `truncated`, and the UI reports the result as incomplete.
- **Every skipped edge has a reason:** revoked, condition_does_not_hold, unknown_excluded, inferred_excluded, hypothetical_excluded, required_access_not_reached, or depth_limit.
- **Containment.** Only a Policy with `enforcementState = enforced_verified` and effect `deny` contains the node it governs. The node is reported as reached and contained, and the traversal does not expand from it. Every other control state is shown as information only and never reduces blast radius.
- **Exfiltration** is reported only as a hypothesis: readable data plus a reachable component with network egress.

## Consequences

- Results are explainable: each reached entity has its full path and the weakest evidence on that path.
- Reachability is not exploitability. Every result carries that disclaimer.
- Gating needs connectors to declare `requiresAction` on edges leaving resources. Ingestion enforces this.
