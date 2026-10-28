import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Optional "Sign in with Google" for a loopback app: OAuth 2.0 authorization code flow with PKCE
 * (S256) and a fixed loopback redirect. Sign-in only identifies the user. The access token is used
 * once to read the OpenID userinfo (name, email) and then dropped; no Google data is accessed and
 * no token is stored. Sessions live in memory only.
 */
export interface GoogleAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Must exactly match an authorized redirect URI on the Google OAuth client. */
  readonly redirectUri: string;
}

export interface SignedInUser {
  readonly name: string;
  readonly email: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPES = "openid email profile";

const PENDING_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PENDING = 20;
const MAX_SESSIONS = 50;
const REQUEST_TIMEOUT_MS = 10_000;
export const SESSION_COOKIE = "mcpradius_session";
export const SESSION_MAX_AGE_S = SESSION_TTL_MS / 1000;

const TokenResponseSchema = z.object({ access_token: z.string().min(1).max(4096) });
const UserInfoSchema = z.object({
  email: z.email().max(320),
  email_verified: z.boolean().optional(),
  name: z.string().max(200).optional(),
});

/** Reads client settings from the environment. Returns null when sign-in isn't configured. */
export function googleAuthConfigFromEnv(
  env: NodeJS.ProcessEnv,
  port: number,
): GoogleAuthConfig | null {
  const clientId =
    env["MCPRADIUS_GOOGLE_CLIENT_ID"]?.trim() ?? env["AGENTRADIUS_GOOGLE_CLIENT_ID"]?.trim();
  const clientSecret =
    env["MCPRADIUS_GOOGLE_CLIENT_SECRET"]?.trim() ??
    env["AGENTRADIUS_GOOGLE_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `http://127.0.0.1:${port}/api/v1/auth/google/callback`,
  };
}

const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export interface GoogleAuth {
  readonly configured: boolean;
  /** Starts a sign-in. Returns the Google URL to redirect the browser to. */
  begin(returnTo: string): string;
  /** Completes a sign-in. Returns the new session ID and where to send the browser. */
  complete(
    params: URLSearchParams,
  ): Promise<{ sessionId: string; returnTo: string } | { error: true; returnTo: string | null }>;
  user(sessionId: string | undefined): SignedInUser | null;
  signOut(sessionId: string | undefined): void;
}

export function createGoogleAuth(
  config: GoogleAuthConfig | null,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now,
): GoogleAuth {
  const pending = new Map<string, { verifier: string; returnTo: string; expires: number }>();
  const sessions = new Map<string, SignedInUser & { expires: number }>();

  const prune = () => {
    const t = now();
    for (const [k, v] of pending) if (v.expires <= t) pending.delete(k);
    for (const [k, v] of sessions) if (v.expires <= t) sessions.delete(k);
  };
  const evictOldest = (map: Map<string, unknown>, max: number) => {
    while (map.size >= max) map.delete(map.keys().next().value as string);
  };

  return {
    configured: config !== null,
    begin(returnTo) {
      if (config === null) throw new Error("Google sign-in is not configured");
      prune();
      evictOldest(pending, MAX_PENDING);
      const state = token();
      const verifier = token(48);
      pending.set(state, { verifier, returnTo, expires: now() + PENDING_TTL_MS });
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: SCOPES,
        state,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return url.toString();
    },
    async complete(params) {
      prune();
      const state = params.get("state") ?? "";
      const entry = pending.get(state);
      pending.delete(state);
      if (config === null || entry === undefined) return { error: true, returnTo: null };
      const code = params.get("code");
      if (!code || params.has("error")) return { error: true, returnTo: entry.returnTo };
      try {
        const tokenRes = await fetchImpl(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            grant_type: "authorization_code",
            code_verifier: entry.verifier,
          }).toString(),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!tokenRes.ok) return { error: true, returnTo: entry.returnTo };
        const { access_token } = TokenResponseSchema.parse(await tokenRes.json());
        const infoRes = await fetchImpl(USERINFO_URL, {
          headers: { Authorization: `Bearer ${access_token}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!infoRes.ok) return { error: true, returnTo: entry.returnTo };
        const info = UserInfoSchema.parse(await infoRes.json());
        if (info.email_verified === false) return { error: true, returnTo: entry.returnTo };
        evictOldest(sessions, MAX_SESSIONS);
        const sessionId = token();
        sessions.set(sessionId, {
          name: info.name?.trim() || info.email,
          email: info.email,
          expires: now() + SESSION_TTL_MS,
        });
        return { sessionId, returnTo: entry.returnTo };
      } catch {
        // Network, timeout, or unexpected response shape. Details are not surfaced.
        return { error: true, returnTo: entry.returnTo };
      }
    },
    user(sessionId) {
      prune();
      const s = sessionId === undefined ? undefined : sessions.get(sessionId);
      return s ? { name: s.name, email: s.email } : null;
    },
    signOut(sessionId) {
      if (sessionId !== undefined) sessions.delete(sessionId);
    },
  };
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}
