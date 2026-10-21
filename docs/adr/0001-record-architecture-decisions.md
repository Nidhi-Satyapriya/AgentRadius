# 0001. Record architecture decisions

**Status:** Accepted (2026-10-21)

## Context

AgentRadius makes security claims about what it can observe and control. Decisions that affect those claims need to be traceable: why traversal treats unknown edges the way it does, why one control limits blast radius and another does not.

## Decision

Keep lightweight ADRs in `docs/adr/`, numbered sequentially. Each has a status: Proposed, Accepted, or Superseded by NNNN. Proposed records cover work that needs the user's approval before implementation, such as enforcement and live discovery.

## Consequences

- Reviewers can check a behavior against the decision that motivated it.
- Proposed ADRs act as the gate for privileged or state-changing features. They are not implemented until accepted.
