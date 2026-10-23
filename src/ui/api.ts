import {
  API_PREFIX,
  type ApiErrorBody,
  type BlastRadiusRequest,
  type BlastRadiusResponse,
  type DeclareAgentRequest,
  type SimulationRequest,
  type SimulationResponse,
  type WorkspaceResponse,
} from "../api/contracts.ts";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body?.error.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const api = {
  workspace: () => request<WorkspaceResponse>("/workspace"),
  scanThisMac: () => request<WorkspaceResponse>("/scans", { method: "POST", body: "{}" }),
  useDemo: () => request<WorkspaceResponse>("/demo", { method: "POST", body: "{}" }),
  blastRadius: (body: BlastRadiusRequest) =>
    request<BlastRadiusResponse>("/blast-radius", { method: "POST", body: JSON.stringify(body) }),
  simulate: (body: SimulationRequest) =>
    request<SimulationResponse>("/simulations", { method: "POST", body: JSON.stringify(body) }),
  declareAgent: (body: DeclareAgentRequest) =>
    request<WorkspaceResponse>("/agents", { method: "POST", body: JSON.stringify(body) }),
  removeAgent: (id: string) =>
    request<WorkspaceResponse>("/agents/remove", { method: "POST", body: JSON.stringify({ id }) }),
};
