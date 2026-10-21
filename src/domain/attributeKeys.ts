import { ENFORCEMENT_STATES, type EnforcementState } from "./vocabulary.ts";
import type { GraphNode } from "./schema.ts";

/**
 * The only attribute keys analysis rules may read. Everything else in `attributes` is display-only.
 * Connectors are responsible for normalizing provider data into these keys.
 */
export const ATTRIBUTE_KEYS = {
  /** Resource: `low | moderate | high | critical` data or system sensitivity. */
  sensitivity: "sensitivity",
  /** Permission: `narrow | broad | admin` breadth of the scope relative to its resource class. */
  scopeBreadth: "scopeBreadth",
  /** Tool / MCPServer: `true` when it can send data to arbitrary network destinations. */
  networkEgress: "networkEgress",
  /** Policy: one of ENFORCEMENT_STATES. */
  enforcementState: "enforcementState",
  /** Policy: `deny | require_approval | monitor`. */
  controlEffect: "controlEffect",
  /** MCPServer: package registry (`npm`, `pypi`, `local`, `docker`, `remote`). */
  packageSource: "packageSource",
  /** MCPServer: `true` when the configured package version is pinned. */
  versionPinned: "versionPinned",
  /** Permission: `oauth_scope | token_scope | cloud_policy | os_privacy`. */
  permissionKind: "permissionKind",
  /** CredentialReference: one of CREDENTIAL_STORAGES. Where the secret lives, never the secret. */
  credentialStorage: "credentialStorage",
} as const;

/**
 * - plaintext_config: the value is written literally in a configuration file.
 * - secret_manager_reference: e.g. `op://…`; resolved by a secret manager at launch.
 * - prompted_input: the client prompts the user and stores it in its own secret storage.
 * - environment_reference: interpolated from the launching environment, e.g. `${env:NAME}`.
 * - file_reference: the value is a path to a credential file (e.g. a service-account key).
 */
export const CREDENTIAL_STORAGES = [
  "plaintext_config",
  "secret_manager_reference",
  "prompted_input",
  "environment_reference",
  "file_reference",
  "unknown",
] as const;
export type CredentialStorage = (typeof CREDENTIAL_STORAGES)[number];

export const SENSITIVITIES = ["low", "moderate", "high", "critical"] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export const SCOPE_BREADTHS = ["narrow", "broad", "admin"] as const;
export type ScopeBreadth = (typeof SCOPE_BREADTHS)[number];

export const CONTROL_EFFECTS = ["deny", "require_approval", "monitor"] as const;
export type ControlEffect = (typeof CONTROL_EFFECTS)[number];

function enumAttribute<T extends string>(
  node: GraphNode,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = node.attributes[key];
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export function sensitivityOf(node: GraphNode): Sensitivity | undefined {
  return enumAttribute(node, ATTRIBUTE_KEYS.sensitivity, SENSITIVITIES);
}

export function scopeBreadthOf(node: GraphNode): ScopeBreadth | undefined {
  return enumAttribute(node, ATTRIBUTE_KEYS.scopeBreadth, SCOPE_BREADTHS);
}

export function enforcementStateOf(node: GraphNode): EnforcementState | undefined {
  return enumAttribute(node, ATTRIBUTE_KEYS.enforcementState, ENFORCEMENT_STATES);
}

export function controlEffectOf(node: GraphNode): ControlEffect | undefined {
  return enumAttribute(node, ATTRIBUTE_KEYS.controlEffect, CONTROL_EFFECTS);
}

export function hasNetworkEgress(node: GraphNode): boolean {
  return node.attributes[ATTRIBUTE_KEYS.networkEgress] === true;
}

export function packageSourceOf(node: GraphNode): string | undefined {
  const value = node.attributes[ATTRIBUTE_KEYS.packageSource];
  return typeof value === "string" ? value : undefined;
}

/** `undefined` means the pin state is unknown, which is not the same as unpinned. */
export function versionPinnedOf(node: GraphNode): boolean | undefined {
  const value = node.attributes[ATTRIBUTE_KEYS.versionPinned];
  return typeof value === "boolean" ? value : undefined;
}

export function credentialStorageOf(node: GraphNode): CredentialStorage | undefined {
  return enumAttribute(node, ATTRIBUTE_KEYS.credentialStorage, CREDENTIAL_STORAGES);
}

export function permissionKindOf(node: GraphNode): string | undefined {
  const value = node.attributes[ATTRIBUTE_KEYS.permissionKind];
  return typeof value === "string" ? value : undefined;
}
