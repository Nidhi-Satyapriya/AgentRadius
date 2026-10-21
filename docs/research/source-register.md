# Source register

Every external reference used in AgentRadius research, pinned so findings can be re-verified.

- **Inspection date:** 2026-10-21. Repositories were shallow-cloned read-only into a temporary directory outside the workspace. Nothing was executed, installed, or modified.
- **Copying:** no code, assets, or branding from these sources is copied into AgentRadius. Findings describe behavior in our own words. Path and line citations exist so a reviewer can check them.
- **Evidence labels** used across `docs/research/`:

| Label          | Meaning                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| **verified**   | Behavior read in source code at the pinned commit (and in tests where cited).                                |
| **documented** | Stated in the project's README, docs, or website. Not confirmed in code.                                     |
| **observed**   | Seen by fetching a live page or artifact. Describes what was published, not how it is implemented.           |
| **hypothesis** | Our inference from verified or documented facts. May be wrong.                                               |
| **missing**    | Looked for and not found at the pinned commit. Absence in a repo is not proof the vendor lacks it elsewhere. |

## Repositories

| ID      | Repository                                                                                  | Commit (pinned)                            | Commit date | License                                                                | Notes                                         |
| ------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| SRC-SG  | [alifanov/scopegate](https://github.com/alifanov/scopegate)                                 | `f0eb9b94e4dd5779655370da6facab033a1cdab4` | 2026-10-20  | MIT (`LICENSE`, `package.json`)                                        | Hosted Next.js/Postgres MCP gateway.          |
| SRC-AGT | [microsoft/agent-governance-toolkit](https://github.com/microsoft/agent-governance-toolkit) | `3c162e7f7b6109b498846f68e9c6c266bb8071f6` | 2026-10-20  | MIT (`LICENSE`); `policy-engine/LICENSE.acs` not reviewed              | Multi-language, v5.0.0.                       |
| SRC-MFR | [ressl/mcp-firewall](https://github.com/ressl/mcp-firewall)                                 | `4dfc97680fedeaa26c7a55adb523750137461d84` | 2026-09-09  | **AGPL-3.0-or-later**                                                  | Do not reuse code. Describe behavior only.    |
| SRC-MFM | [mukuna-web/mcp-firewall](https://github.com/mukuna-web/mcp-firewall)                       | `1384387d6239ac7b260784ff52c7b66ccfc73921` | 2026-07-17  | MIT                                                                    | Library-only decision core.                   |
| SRC-AS  | [prakash601/AuthScope](https://github.com/prakash601/AuthScope)                             | `1a1489ac46d22ab4bffd82598a51c9c680a1f828` | 2026-09-19  | **Ambiguous**: `LICENSE` says MIT, `pyproject.toml` says "Proprietary" | Treat as all-rights-reserved until clarified. |

## Web pages

| ID           | URL                                                     | Fetched                | What it is                                                                            |
| ------------ | ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| WEB-SG-SEC   | <https://scopegate.io/docs/security-model>              | 2026-10-21             | ScopeGate security model (vendor docs).                                               |
| WEB-SG-CLI   | <https://scopegate.io/docs/cli-reference>               | 2026-10-21             | ScopeGate CLI reference (vendor docs).                                                |
| WEB-SM-SEC   | <https://scopemantle.com/security>                      | 2026-10-21             | ScopeMantle security page (vendor marketing/trust page). No source code is available. |
| WEB-AGT-DOCS | <https://microsoft.github.io/agent-governance-toolkit/> | not fetched separately | The same content is in the repo's `docs/`, which was read at the pinned commit.       |

## Discrepancies found between documentation and code

These matter because AgentRadius must not repeat claims it has not verified.

| Source             | Documentation says                                                                                                                                                                                                  | Code at pinned commit shows                                                                                                                                                                         | Label                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ScopeGate          | WEB-SG-CLI and WEB-SG-SEC describe a local `scopegate` CLI: stdio gateway, `~/.scopegate/vault.enc`, harness config migration with `.pre-scopegate.bak` backups, `rollback`, a signed audit chain, and honeytokens. | `package.json` has no `bin`. A search for `vaultd`, `pre-scopegate`, `request_capability`, `honeytoken`, `audit.jsonl`, and `git-credential` returns nothing. The repo is a hosted Next.js gateway. | missing (documented elsewhere; source unavailable)                      |
| ScopeGate          | WEB-SG-SEC calls honeytokens "roadmap … not in this repo yet".                                                                                                                                                      | WEB-SG-CLI documents `scopegate honeytoken plant` as a command.                                                                                                                                     | documented (self-inconsistent)                                          |
| ScopeGate          | `docs/state/spec/flows/mcp-tool-call.md` says denied calls are logged.                                                                                                                                              | Denied tools are never registered, so no audit row is written.                                                                                                                                      | verified (contradicts docs)                                             |
| ScopeGate          | WEB-SG-CLI says the cloud admin token defaults to `dev-admin-token`.                                                                                                                                                | Not in this repo.                                                                                                                                                                                   | documented. A hardcoded default credential is an anti-pattern to avoid. |
| AGT                | `docs/LIMITATIONS.md` and `threat-model.md` say an empty policy set allows.                                                                                                                                         | The legacy YAML engine denies when no policies are loaded (`agent-mesh/.../governance/policy.py`).                                                                                                  | verified (contradicts docs)                                             |
| ressl/mcp-firewall | README advertises `audit export` to CEF.                                                                                                                                                                            | `ARCHITECTURE.md` says it is not implemented, and `cli.py` has no such command.                                                                                                                     | verified (missing)                                                      |
| AuthScope          | README says it probes `/.well-known/openid-configuration`.                                                                                                                                                          | It only matches requests the page itself made. It never sends its own probe.                                                                                                                        | verified (contradicts docs)                                             |
| AuthScope          | README claims 130 tests and 90% coverage.                                                                                                                                                                           | About 162 test functions, with `fail_under` set to 70.                                                                                                                                              | verified (differs)                                                      |

## Rules applied while researching

- **No hardcoded credentials:** no live secret values were found or reproduced. Inline CI and dev defaults are noted as patterns to avoid: AuthScope's `ci.yml` values and ScopeGate Cloud's documented `dev-admin-token`.
- **Certificates:** none of the repositories embeds or loads an X.509 certificate in the files reviewed.
- **Crypto:**
  - Flagged as deprecated under the workspace crypto rule: AGT's credential vault uses Fernet (AES-128-CBC with HMAC-SHA256). Use AES-256-GCM instead.
  - Acceptable algorithms seen: AES-256-GCM, HMAC-SHA256, PBKDF2-SHA256, SHA-256, Ed25519.
  - ScopeGate's weakness is key management, not its algorithms: one secret derives every key, with a static salt and no rotation.
