# 0002. TypeScript single-language stack

**Status:** Accepted (2026-10-21)

## Context

The starter specification suggested Python/FastAPI/Postgres for the backend and a separate frontend. AgentRadius is a single-user local tool. Its central asset is a domain contract (graph schema, analysis results) that both the API and the UI must agree on exactly.

## Decision

Use TypeScript end to end on Node (≥ 24, developed on 26), running `.ts` files directly through Node's native type stripping. The domain schema, analysis, API, and UI share one set of types.

| Dependency                                  | Why it is needed                                                                                                            | Why not something else                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `zod`                                       | Runtime validation of every external input, inferred TypeScript types, and JSON Schema generation from the same definitions | Hand-written validators would duplicate types and drift                               |
| `react`, `react-dom`                        | Accessible, componentized dashboard                                                                                         | Needed for nine interactive pages. Plain DOM code would be harder to keep accessible. |
| `vite`, `@vitejs/plugin-react`              | Dev server and production bundling                                                                                          | Standard and fast. Nothing used at runtime.                                           |
| `vitest`, `jsdom`, `@testing-library/react` | Unit, integration, and component tests in one runner                                                                        | Uses the same transform as Vite                                                       |
| `typescript`, `@types/*`                    | Type checking only (`noEmit`)                                                                                               | —                                                                                     |
| `oxlint`, `prettier`                        | Lint (including import cycles) and formatting                                                                               | `oxlint` is fast and needs no plugin tree                                             |

**Not used, on purpose:**

- **No HTTP framework.** `node:http` is enough for four routes, and it keeps the security headers and checks explicit.
- **No database.** The MVP holds one snapshot in memory.
- **No graph library** ([ADR 0009](./0009-custom-svg-graph.md)).
- **No router library.** Hash routing is about 40 lines of code.

## Consequences

- One `npm run check` covers typecheck, lint, format, and tests across all layers.
- Module boundaries are enforced by a test (`tests/architecture.test.ts`) rather than by package separation.
- The browser bundle must not pull in server-only code. `domain/core.ts` is the validation-free entry point for runtime values, and a test enforces it.
- If persistence is added later, SQLite through `node:sqlite` is the expected first choice. That would need its own ADR.
