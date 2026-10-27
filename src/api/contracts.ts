/**
 * Typed API contract shared by the server and the UI. Type-only imports keep the UI bundle free
 * of analysis code: the browser renders results, it never computes them.
 */
import type {
  AnalysisSettings,
  BlastRadiusReport,
  GraphChange,
  SimulationResult,
} from "../analysis/index.ts";
import type { AgentDeclarationInput, WorkspaceView } from "../application/workspace.ts";
import type { ProviderId } from "../domain/index.ts";

export const API_PREFIX = "/api/v1";

export interface HealthResponse {
  readonly status: "ok";
  readonly mode: "read_only";
  /** Always false in this release: no enforcement adapter exists yet. */
  readonly enforcementActive: false;
}

export type WorkspaceResponse = WorkspaceView;

export interface AuthResponse {
  readonly provider: "google";
  /** False until a Google OAuth client is set in the environment. */
  readonly configured: boolean;
  /** The address to register with Google as the authorized redirect URI. */
  readonly redirectUri: string;
  /** Who is signed in. Identity only: AgentRadius gets no access to Google data. */
  readonly user: { readonly name: string; readonly email: string } | null;
}

export type DeclareAgentRequest = AgentDeclarationInput;

export interface ConnectRequest {
  readonly provider: ProviderId;
  /** Sent once over loopback, used for one read, and dropped. Never returned. */
  readonly token: string;
}

export interface BlastRadiusRequest {
  readonly startId: string;
  readonly settings?: Partial<AnalysisSettings>;
}
export type BlastRadiusResponse = BlastRadiusReport;

export interface SimulationRequest {
  readonly startId: string;
  readonly changes: readonly GraphChange[];
  readonly settings?: Partial<AnalysisSettings>;
}
export type SimulationResponse = SimulationResult;

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly issues?: readonly { path: string; message: string }[];
  };
}

export type { AnalysisSettings, GraphChange };
