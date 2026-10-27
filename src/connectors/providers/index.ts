import type { ProviderId } from "../../domain/index.ts";
import { readGitHub } from "./github.ts";
import type { FetchLike } from "./http.ts";
import type { ProviderInventory } from "./inventory.ts";
import { readNotion } from "./notion.ts";

export { ProviderError, type FetchLike, type ProviderErrorCode } from "./http.ts";
export type { ProviderInventory } from "./inventory.ts";
export { providerToGraph } from "./toGraph.ts";

export type ReadProvider = (provider: ProviderId, token: string) => Promise<ProviderInventory>;

const READERS: Readonly<
  Record<ProviderId, (token: string, f: FetchLike, now: Date) => Promise<ProviderInventory>>
> = { github: readGitHub, notion: readNotion };

/** Reads one provider with a caller-supplied token. The token is not retained anywhere. */
export function createProviderReader(
  fetchFn: FetchLike = (url, init) => fetch(url, init),
  now: () => Date = () => new Date(),
): ReadProvider {
  return (provider, token) => READERS[provider](token, fetchFn, now());
}
