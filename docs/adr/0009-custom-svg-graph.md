# 0009. Custom SVG graph renderer

**Status:** Accepted (2026-10-21)

## Context

The permission graph needs the following:

- A deterministic layout, so the same snapshot always looks the same.
- Visual encoding of evidence strength.
- Keyboard access to every node and edge.
- Dimming and highlighting for selected paths.

Graph libraries add hundreds of kilobytes, use force layouts that do not settle the same way twice, and often render to canvas, which screen readers cannot see.

## Decision

- **Layout.** `src/ui/graph/layout.ts` is a pure function that does longest-path layering. Columns follow the direction of compromise, and `TRUSTS` is drawn in reverse. Cycles are handled with bounded relaxation. Rows within a column are ordered by the average row of their predecessors, then by ID. It is unit-tested for determinism, cycles, and filtered endpoints.
- **Rendering.** `src/ui/graph/GraphCanvas.tsx` draws SVG.
  - Nodes and edges are focusable `role="button"` elements with descriptive `aria-label`s.
  - Enter or Space selects.
  - Zoom and pan work by wheel, drag, toolbar buttons, or arrow and +/- keys.
- **Encoding.** Line style shows the assertion: solid for observed, dashed for declared, dotted for inferred, dash-dot for hypothetical, and faint dots for unknown. Stale edges are tinted. Text badges repeat the same information, so it never depends on color alone.
- **Accessible alternative.** The Permission Graph page has a List view that renders every visible relationship as a table.

## Consequences

- There are no graph-library dependencies.
- Layered layout works well up to a few hundred visible nodes. Larger graphs will need filtering or collapsing by type, which is already supported, before a different layout is considered.
