# Product Specification

## Problem
Teams connect AI agents to MCP tools, SaaS APIs, cloud identities, repositories, and local developer environments without a unified view of effective access. Permission reviews are fragmented across configuration files, vendor consoles, and human memory. AgentRadius makes those relationships explorable and highlights excessive or unexpectedly connected privilege.

## Target users
- Security engineers reviewing AI-agent and developer-tool access.
- Platform engineers operating MCP servers and internal integrations.
- Application owners who need to understand what an agent or credential can reach.

## Jobs to be done
- For a selected agent or identity, answer: “What can it access, through which path, and based on what evidence?”
- Before a change, answer: “What access would be added or removed?”
- For a finding, answer: “Why does this matter, how confident are we, and what should be checked next?”

## MVP scope
1. Import local MCP configuration and synthetic connector manifests.
2. Normalize entities and relationships into a typed permission graph.
3. Query paths from an agent/identity to resources and actions.
4. Calculate reachable resources, high-impact actions, and path explanations.
5. Detect configurable rules: broad scopes, write-capable tools, unowned credentials, public exposure, and privilege paths crossing trust boundaries.
6. Simulate graph changes on a copy and produce a before/after diff.
7. UI: graph canvas, entity detail, finding list, evidence panel, connector configuration, and export.

## Out of scope for MVP
- Automatically changing third-party permissions.
- Secret extraction, credential testing, exploitation, or offensive actions.
- Claiming complete effective access when source APIs provide incomplete data.
- Autonomous remediation without human approval.

## Main screens
- **Overview:** inventory counts, coverage, high-severity findings, stale collections.
- **Graph Explorer:** filters by entity type, edge type, trust boundary, confidence, and source.
- **Entity Detail:** identity, capabilities, inbound/outbound edges, evidence, last seen.
- **Findings:** severity, confidence, affected path, rationale, remediation guidance, status.
- **Connectors:** adapter status, scopes requested, last sync, permissions, configuration validation.
- **Simulation:** proposed edge/permission changes, graph diff, newly reachable assets, removed reachability.

## UX requirements
- Every finding has a human-readable explanation and a reproducible path.
- Distinguish “observed”, “inferred”, and “unknown”; never render unknown as denied.
- Clicking a node or edge opens its detail panel without losing graph context.
- Large graphs must support search, progressive expansion, filtering, and path focus.
- Keyboard navigation, visible focus states, accessible labels, and color-independent status cues are required.
- Destructive or write-capable actions are absent in MVP; future ones require explicit confirmation and audit logging.

## Success metrics
- Time to answer a defined “what can this agent reach?” scenario.
- Percentage of graph edges with source evidence and timestamps.
- Finding precision on a labeled fixture corpus.
- Connector collection success and freshness.
- Percentage of findings with actionable, source-backed remediation guidance.
