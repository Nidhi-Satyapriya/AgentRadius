/**
 * Accounts the user can connect with a read-only token they create themselves. The token is used
 * for one read and then dropped; it is never stored, logged, or returned.
 */

export const PROVIDER_IDS = ["github", "notion"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderInfo {
  readonly id: ProviderId;
  readonly label: string;
  /** Catalog app whose "everything you can access" resource the items attach to. */
  readonly appId: string;
  readonly items: readonly [singular: string, plural: string];
  readonly tokenName: string;
  /** Shape of an accepted token. Classic or broad tokens are refused on purpose. */
  readonly tokenPattern: RegExp;
  readonly tokenHint: string;
  readonly setupUrl: string;
  readonly setupSteps: readonly string[];
  /** What the connection cannot see, shown next to the results. */
  readonly limits: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "github",
    label: "GitHub",
    appId: "github",
    items: ["repository", "repositories"],
    tokenName: "fine-grained personal access token",
    tokenPattern: /^github_pat_[A-Za-z0-9_]{22,255}$/,
    tokenHint: "Starts with github_pat_",
    setupUrl: "https://github.com/settings/personal-access-tokens/new",
    setupSteps: [
      "Open GitHub's new fine-grained token page.",
      "Pick a short expiry and choose “All repositories” (or the ones you want checked).",
      "Leave every permission at “No access” except Metadata, which is read-only and required.",
      "Generate the token and paste it here.",
    ],
    limits:
      "Shows the repositories this token can see and your role in each. Organization settings, secrets, and other people's access are not read.",
  },
  {
    id: "notion",
    label: "Notion",
    appId: "notion",
    items: ["page", "pages"],
    tokenName: "internal integration secret",
    tokenPattern: /^(?:ntn_|secret_)[A-Za-z0-9]{20,100}$/,
    tokenHint: "Starts with ntn_ or secret_",
    setupUrl: "https://www.notion.so/profile/integrations",
    setupSteps: [
      "Create a new internal integration in your Notion workspace.",
      "Under Capabilities, keep only “Read content”. Turn off update, insert, comments, and user information.",
      "Share the pages you want checked with the integration (page menu → Connections).",
      "Copy the integration secret and paste it here.",
    ],
    limits:
      "Notion only shows an integration the pages you shared with it. Notion AI acts as you and may reach more.",
  },
];

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id)!;
}

/** Connector run ID for a provider connection. */
export const providerConnectorId = (id: ProviderId) => `provider.${id}`;
