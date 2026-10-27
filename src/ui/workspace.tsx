import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { WorkspaceResponse } from "../api/contracts.ts";
import type { Finding, GraphEdge, GraphNode } from "../domain/index.ts";

export interface WorkspaceModel {
  readonly data: WorkspaceResponse;
  /** Swaps in a new workspace (after a scan or an added or removed agent); absent in static renders. */
  readonly replace?: (next: WorkspaceResponse) => void;
  readonly node: (id: string) => GraphNode | undefined;
  readonly edge: (id: string) => GraphEdge | undefined;
  readonly label: (id: string) => string;
  readonly isStale: (id: string) => boolean;
  readonly findingsFor: (entityId: string) => readonly Finding[];
}

const WorkspaceContext = createContext<WorkspaceModel | null>(null);

export function buildWorkspaceModel(
  data: WorkspaceResponse,
  replace?: (next: WorkspaceResponse) => void,
): WorkspaceModel {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  const stale = new Set(data.staleIds);
  const byEntity = new Map<string, Finding[]>();
  for (const f of data.findings) {
    for (const id of f.affectedEntityIds) byEntity.set(id, [...(byEntity.get(id) ?? []), f]);
  }
  return {
    data,
    ...(replace ? { replace } : {}),
    node: (id) => nodes.get(id),
    edge: (id) => edges.get(id),
    label: (id) => nodes.get(id)?.label ?? id,
    isStale: (id) => stale.has(id),
    findingsFor: (id) => byEntity.get(id) ?? [],
  };
}

export function WorkspaceProvider({
  data,
  replace,
  children,
}: {
  data: WorkspaceResponse;
  replace?: (next: WorkspaceResponse) => void;
  children: ReactNode;
}) {
  const model = useMemo(() => buildWorkspaceModel(data, replace), [data, replace]);
  return <WorkspaceContext.Provider value={model}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceModel {
  const model = useContext(WorkspaceContext);
  if (model === null) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return model;
}
