# 0010. Optional Google sign-in, and no sample data in the app

**Status:** Accepted (2026-10-27)

## Context

The user asked for the dashboard to show no synthetic data, and for a sign-in step at the start of onboarding. AgentRadius is a single-user, local-first tool, so sign-in protects nothing on its own. It only records who is using the app. It must not become a way for local inventory to leave the Mac, and it must not ask for access to the user's Google data.

## Decision

- **The workspace starts empty.** The demo fixture is no longer reachable from the app or the API (`POST /demo` is removed). It stays in `src/fixtures/` for automated tests only. The UI shows data only after the user adds an agent or scans this Mac. "LIVE · THIS MAC" appears only after a scan (`WorkspaceView.scannedAt`).
- **Sign-in is optional** and uses Google's OAuth 2.0 authorization-code flow with PKCE (S256) and a single-use `state`.
  - Scopes: `openid email profile` only. No Gmail, Drive, Calendar, or other Google API scopes.
  - The redirect URI is fixed: `http://127.0.0.1:4317/api/v1/auth/google/callback`.
  - The client ID and secret come from `AGENTRADIUS_GOOGLE_CLIENT_ID` and `AGENTRADIUS_GOOGLE_CLIENT_SECRET`. Without both, sign-in reports `configured: false` and the UI shows setup steps instead.
- **Network egress is limited to two fixed Google URLs**: the token endpoint and the OpenID Connect userinfo endpoint. Both requests time out after 10 seconds. No inventory, graph, or finding data is sent.
- **Nothing is kept from Google except the name and email.** The access token is used once to read the profile, then dropped. No refresh token is requested. Errors from Google are never surfaced.
- **The session is in memory.** A random session ID lives in an `HttpOnly; SameSite=Lax` cookie with a 12-hour maximum age. There are at most 50 sessions and 20 pending sign-ins (pending ones expire after 10 minutes). Restarting AgentRadius signs everyone out.
- The `return` address after sign-in must be one of the app's own allowed origins, so the callback cannot be used as an open redirect.
- Sign-out is a same-origin POST, like every other state change ([ADR 0006](./0006-loopback-api-security.md)).

## Consequences

- No new dependencies. The flow uses `fetch` and `node:crypto` (SHA-256 for PKCE, random bytes for state and session IDs).
- Google client secrets (`GOCSPX-…`) and access tokens (`ya29.…`) were added to `src/redaction/secretPatterns.ts`, so they are rejected if they ever appear in a snapshot.
- Sign-in does not gate the API. Another local process can still call it ([threat model](../threat-model.md) T4). A per-session API token remains a separate, open item.
- Signing in does not unlock or connect any account integration. The UI says this next to the sign-in button.
