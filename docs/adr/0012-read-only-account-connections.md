# 0012. Read-only account connections with a pasted token that is not kept

**Status:** Accepted (2026-10-27). The user chose this approach on 2026-10-27: pasted read-only tokens, kept in memory only.

## Context

An in-app assistant such as GitHub Copilot or Notion AI acts with the user's permissions. Without provider data, AgentRadius can only show a placeholder, "GitHub: everything you can access". The user wanted to see the real repositories and pages.

GitHub's standard OAuth sign-in has no read-only scope for private repositories: the `repo` scope also grants write. Registering an app per user adds setup work.

## Decision

- **The user creates the token.** Two kinds are accepted, and the server checks the token's shape before any request:
  - GitHub: a fine-grained personal access token (`github_pat_…`) with only the read-only Metadata permission. Classic `ghp_` tokens are refused.
  - Notion: an internal integration secret (`ntn_…` or `secret_…`) with only the "Read content" capability.
- **One read, then the token is dropped.** `POST /api/v1/connections` passes the token to the reader (`src/connectors/providers/`), which makes read-only requests and returns an inventory.
  - The token is not stored in the session or the snapshot, and it is never written to disk, logged, or returned. Error messages never echo it.
  - "Read again" asks for a token again.
  - The UI clears the input as soon as it is submitted.
- **Egress is fixed.** The only endpoints called are:
  - GitHub: `GET https://api.github.com/user` and `GET https://api.github.com/user/repos`.
  - Notion: `GET https://api.notion.com/v1/users/me` and `POST https://api.notion.com/v1/search`.

  Redirects are refused (`redirect: "error"`), so the token can't be forwarded. Each request times out after 15 seconds, responses over 5 MB are rejected, and a read stops after 10 pages of 100.

- **What goes in the graph.**
  - A `UserIdentity` node for the account, a `Resource` node per repository or page, and access edges between them. Node IDs use the provider's numeric or UUID ID, never a name.
  - GitHub permissions come from the provider, so they are `observed` with high confidence. Notion only says a page was shared with the integration, so its read and write edges are `inferred` (rule `notion-shared-with-integration`).
  - Items are also linked, with rule `connected-account-contents`, from the existing "everything you can access" resource of an added agent, and from a matching MCP server's resource. The MCP link carries an unresolved condition, because the server's own token may reach less.
  - Names that match a secret pattern are replaced with "(name hidden)".
- **Status is honest.** A connection appears only after a read succeeded, and shows what was read and when. The connector run lists what the connection cannot see.

## Consequences

- Repository names, Notion page titles, the GitHub login, and the Notion workspace name are held in memory and shown locally. They are never sent anywhere else.
- AgentRadius cannot verify that a fine-grained token has no write permissions. The setup steps ask for Metadata only. The connection itself only reads.
- Notion shows an integration only the pages shared with it, so Notion results are a lower bound.
- Connections are lost when AgentRadius restarts.
- Organization-level access (teams, outside collaborators, GitHub Apps) is not read.
