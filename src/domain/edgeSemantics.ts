import type { Action, EdgeType } from "./vocabulary.ts";

/**
 * How compromise propagates across an edge.
 * - forward: control of `from` yields the capability described by the edge over `to`.
 * - reverse: control of `to` yields influence over `from` (e.g. A TRUSTS B: compromising B affects A).
 * - none: metadata only; never traversed.
 */
export type Propagation = "forward" | "reverse" | "none";

export interface EdgeSemantics {
  readonly propagation: Propagation;
  /** Human-readable verb used in path explanations: "<from> <verb> <to>". */
  readonly verb: string;
  /** Action conferred on the target when this edge is traversed, for access edges. */
  readonly grantsAction?: Action;
}

export const EDGE_SEMANTICS: Readonly<Record<EdgeType, EdgeSemantics>> = {
  RUNS_AS: { propagation: "forward", verb: "runs as" },
  HOSTS: { propagation: "forward", verb: "hosts" },
  CONNECTS_TO: { propagation: "forward", verb: "can send requests to" },
  EXPOSES_TOOL: { propagation: "forward", verb: "exposes tool" },
  AUTHENTICATES_WITH: { propagation: "forward", verb: "authenticates with" },
  HOLDS_CREDENTIAL_REFERENCE: { propagation: "forward", verb: "holds a reference to" },
  GRANTS_SCOPE: { propagation: "forward", verb: "holds permission" },
  ASSUMES_ROLE: { propagation: "forward", verb: "can assume role" },
  CAN_READ: { propagation: "forward", verb: "can read", grantsAction: "read" },
  CAN_WRITE: { propagation: "forward", verb: "can write", grantsAction: "write" },
  CAN_DELETE: { propagation: "forward", verb: "can delete", grantsAction: "delete" },
  CAN_EXECUTE: { propagation: "forward", verb: "can execute", grantsAction: "execute" },
  CAN_ADMIN: { propagation: "forward", verb: "can administer", grantsAction: "admin" },
  DELEGATES_TO: { propagation: "forward", verb: "delegates to" },
  TRUSTS: { propagation: "reverse", verb: "trusts" },
  REACHES: { propagation: "forward", verb: "has network reach to" },
  CONTROLLED_BY: { propagation: "none", verb: "is governed by" },
};

export function isAccessEdge(type: EdgeType): boolean {
  return EDGE_SEMANTICS[type].grantsAction !== undefined;
}
