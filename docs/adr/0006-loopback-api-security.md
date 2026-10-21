# 0006. Loopback API security

**Status:** Accepted (2026-10-21)

## Context

A local web UI needs a local API. Loopback binding alone does not protect it. The specific risks are:

- Any website the user visits can send requests to `127.0.0.1` (CSRF).
- A website can rebind its DNS name to `127.0.0.1` and then read the responses.
- Other local processes can connect.

The research found an unauthenticated loopback dashboard (ressl/mcp-firewall) as a concrete anti-example.

## Decision

`src/api/server.ts`, using `node:http` with no framework:

| Threat                          | Control                                                                                                                                                                           | Test                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Network exposure                | Bind to `127.0.0.1` only. The port is validated (1024–65535).                                                                                                                     | `src/api/config.ts` |
| DNS rebinding                   | Reject any `Host` header other than `127.0.0.1:<port>` or `localhost:<port>` with **421**                                                                                         | `server.test.ts`    |
| CSRF                            | POST requires a same-origin `Origin` (or none) and `Sec-Fetch-Site` of `same-origin` or `none`. Otherwise **403**.                                                                | `server.test.ts`    |
| Form-encoded CSRF               | Only `application/json` bodies are accepted (**415**)                                                                                                                             | `server.test.ts`    |
| Resource exhaustion             | 64 KB request body cap (**413**). Simulation change lists capped at 50 items.                                                                                                     | `server.test.ts`    |
| Malformed input                 | Strict Zod request schemas. Unknown keys are rejected (**400** with field paths).                                                                                                 | `server.test.ts`    |
| Script injection / clickjacking | CSP `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, nosniff, Referrer-Policy no-referrer, COOP and CORP same-origin | `server.test.ts`    |
| Cross-origin reads              | No CORS headers at all                                                                                                                                                            | `server.test.ts`    |
| Information leaks               | Generic error bodies. Internal errors log only the error class name.                                                                                                              | `server.test.ts`    |
| Path traversal                  | Static files are resolved against the root and must stay inside it. Encoded `..` and NUL are rejected.                                                                            | `server.test.ts`    |
| Caching                         | `Cache-Control: no-store` on API responses                                                                                                                                        | `server.test.ts`    |

## Known gap

There is **no per-session token yet.** The current API is read-only, and its POST routes compute results without changing state. Other processes running as the same user can therefore read the workspace view. This is acceptable for fixture data, but **must be closed before live discovery data is served**. The plan is a random token, generated at startup, held only in memory, and passed to the UI through the served HTML. This is tracked in the [roadmap](../implementation-roadmap.md).

## Consequences

- Browser-originated attacks are blocked without user configuration.
- Same-user local processes are outside what a loopback service can defend against. The threat model says so explicitly.
