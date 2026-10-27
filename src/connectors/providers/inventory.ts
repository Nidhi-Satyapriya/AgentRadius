import type { Action, Assertion, Confidence, ProviderId } from "../../domain/index.ts";

/** One thing the connected account can reach, with the actions the provider reports. */
export interface ProviderItem {
  /** The provider's own stable ID (numeric or UUID), never a name. */
  readonly id: string;
  readonly label: string;
  readonly actions: readonly Action[];
  readonly isPrivate?: boolean;
}

/** What one read of a provider returned. Holds no token. */
export interface ProviderInventory {
  readonly provider: ProviderId;
  readonly accountId: string;
  readonly accountLabel: string;
  readonly readAt: string;
  readonly items: readonly ProviderItem[];
  /** True when the item cap was hit, so more exist than are shown. */
  readonly truncated: boolean;
  /** How strongly the provider's answer supports the per-item actions. */
  readonly evidence: {
    readonly assertion: Assertion;
    readonly confidence: Confidence;
    readonly inferenceRule?: string;
  };
  /** Pointer to what was read, e.g. the API endpoint. */
  readonly evidenceRef: string;
}

/** Upper bound on pages fetched per read, so one connection can't run away. */
export const MAX_PAGES = 10;
export const PAGE_SIZE = 100;
