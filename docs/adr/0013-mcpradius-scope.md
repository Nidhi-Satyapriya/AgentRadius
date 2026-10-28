# 0013. MCPRadius scope: local MCP access plus supported account tokens

**Status:** Accepted (2026-10-28). Approved by the user on 2026-10-28.

## Context

The earlier catalog listed many SaaS applications and in-app agents without a corresponding
read-only account connector. That implied coverage MCPRadius could not provide.

## Decision

- Rename the product **MCPRadius**.
- MCPRadius is a local-first blast-radius tool for:
  - MCP clients and servers configured on the developer's computer; and
  - account access that MCPRadius can read using a one-time, read-only token.
- The supported account catalog contains only:
  - GitHub, using a fine-grained personal access token; and
  - Notion, using an internal integration secret.
- The supported in-app agent catalog contains only GitHub Copilot and Notion AI. They are
  initially marked as acting as the user; a successful account read adds concrete repositories or
  pages to their paths.
- MCPRadius does not list applications for which it lacks a reader. Adding another application
  requires an approved reader, explicit token requirements, fixed egress endpoints, secret
  redaction, tests, and documentation.
- Google sign-in remains identity-only and does not add Google Workspace access.

## Consequences

- MCPRadius makes a narrower but verifiable claim: it reports local MCP reach and supported,
  opt-in account reach.
- Slack, Atlassian, Google Workspace, Microsoft 365, and other providers are not presented as
  configurable account integrations until their readers exist.
- Existing `AGENTRADIUS_*` environment variables remain accepted temporarily for compatibility;
  new setup documentation uses `MCPRADIUS_*`.
