import { matchSecretPatterns } from "../../redaction/index.ts";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type ProviderErrorCode = "token_rejected" | "provider_unreachable" | "unexpected_response";

/** Fixed, user-safe messages. Never includes the token, response bodies, or provider text. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  constructor(code: ProviderErrorCode) {
    super(code);
    this.code = code;
  }
}

const TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * One request to a fixed provider URL. Redirects are refused so the token can't be forwarded to
 * another host, and the response size is capped.
 */
export async function requestJson(
  fetchFn: FetchLike,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ProviderError("provider_unreachable");
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError("token_rejected");
  if (!res.ok) throw new ProviderError("unexpected_response");
  const text = await res.text().catch(() => {
    throw new ProviderError("provider_unreachable");
  });
  if (text.length > MAX_BODY_BYTES) throw new ProviderError("unexpected_response");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError("unexpected_response");
  }
}

/** Display names from providers are shown as-is unless they look like a credential. */
export function safeLabel(text: string, fallback: string): string {
  const trimmed = text.trim().slice(0, 200);
  if (trimmed === "") return fallback;
  return matchSecretPatterns(trimmed).length > 0 ? `${fallback} (name hidden)` : trimmed;
}
