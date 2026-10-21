# Competitive analysis (summary)

The full analysis is in [`research/competitive-analysis.md`](./research/competitive-analysis.md). Sources are pinned in [`research/source-register.md`](./research/source-register.md), the capability matrix is in [`research/feature-matrix.md`](./research/feature-matrix.md), and the design comparison is in [`research/architecture-comparison.md`](./research/architecture-comparison.md).

**In one paragraph.** ScopeGate, Microsoft's Agent Governance Toolkit, and the two MCP Firewall projects all focus on mediating tool calls. Each does it a different way:

- ScopeGate uses a hosted gateway with per-endpoint tool allowlists.
- AGT uses in-process cooperative wrappers.
- ressl/mcp-firewall uses a stdio wrapper proxy.
- mukuna-web/mcp-firewall is a library decision core.

ScopeMantle audits organization OAuth grants as a hosted service. AuthScope identifies which vendor powers a website's login.

**None of them inventories a Mac, models what each agent can reach through which credential, or states how confident it is.** That gap is where AgentRadius sits: local-first, explainable reachability with explicit evidence. Enforcement is added later, opt-in and verified per server.

**Documentation-versus-code discrepancies were found in four of the six sources.** For example, ScopeGate's website describes a local CLI that is not in its public repository. These are recorded, and AgentRadius does not repeat any claim it has not verified.
