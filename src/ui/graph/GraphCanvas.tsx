import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { EDGE_SEMANTICS } from "../../domain/core.ts";
import type { GraphEdge, GraphNode } from "../../domain/index.ts";
import { TYPE_LABELS } from "../labels.ts";
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH, type Point } from "./layout.ts";

export interface Selection {
  readonly kind: "node" | "edge";
  readonly id: string;
}

export interface GraphCanvasProps {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly selection: Selection | null;
  readonly onSelect: (selection: Selection) => void;
  /** When set, everything outside these ids is dimmed. */
  readonly emphasis?: {
    readonly nodeIds: ReadonlySet<string>;
    readonly edgeIds: ReadonlySet<string>;
  } | null;
  readonly staleIds?: ReadonlySet<string>;
  readonly findingCounts?: ReadonlyMap<string, number>;
  readonly title: string;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_ZOOM_WIDTH = 240;
const READABLE_WIDTH = 1200;

/** Scales the view box by `factor`, keeping `origin` (default: center) fixed on screen. */
function zoomView(v: ViewBox, factor: number, origin: Point | null, maxWidth: number): ViewBox {
  const w = Math.min(Math.max(v.w * factor, MIN_ZOOM_WIDTH), maxWidth);
  const h = (v.h * w) / v.w;
  const ox = origin?.x ?? v.x + v.w / 2;
  const oy = origin?.y ?? v.y + v.h / 2;
  return { x: ox - ((ox - v.x) * w) / v.w, y: oy - ((oy - v.y) * h) / v.h, w, h };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function edgePath(a: Point, b: Point): { d: string; mid: Point } {
  if (b.x > a.x) {
    const sx = a.x + NODE_WIDTH;
    const sy = a.y + NODE_HEIGHT / 2;
    const ex = b.x;
    const ey = b.y + NODE_HEIGHT / 2;
    const c = (ex - sx) / 2;
    return {
      d: `M${sx},${sy} C${sx + c},${sy} ${ex - c},${ey} ${ex},${ey}`,
      mid: { x: (sx + ex) / 2, y: (sy + ey) / 2 },
    };
  }
  // Same or earlier column: loop below both nodes so the edge never hides behind a node.
  const sx = a.x + NODE_WIDTH / 2;
  const sy = a.y + NODE_HEIGHT;
  const ex = b.x + NODE_WIDTH / 2;
  const ey = b.y + NODE_HEIGHT;
  const dip = Math.max(sy, ey) + 40;
  return {
    d: `M${sx},${sy} C${sx},${dip} ${ex},${dip} ${ex},${ey}`,
    mid: { x: (sx + ex) / 2, y: dip - 10 },
  };
}

export function GraphCanvas(props: GraphCanvasProps) {
  const { nodes, edges, selection, onSelect, emphasis, staleIds, findingCounts, title } = props;
  const layout = useMemo(() => layoutGraph(nodes, edges), [nodes, edges]);
  const labels = useMemo(() => new Map(nodes.map((n) => [n.id, n.label])), [nodes]);
  const fit = useMemo<ViewBox>(
    () => ({ x: 0, y: 0, w: layout.width, h: layout.height + 40 }),
    [layout],
  );
  // Large graphs open at a readable scale from the left (where actors sit); "Fit" shows everything.
  const initial = useMemo<ViewBox>(() => {
    const w = Math.min(fit.w, READABLE_WIDTH);
    return { x: 0, y: 0, w, h: Math.max(fit.h, w * 0.75) };
  }, [fit]);
  // The view is tied to the layout it was computed for; a new layout resets the view.
  const [viewState, setViewState] = useState<{ basis: ViewBox; view: ViewBox }>({
    basis: fit,
    view: initial,
  });
  const view = viewState.basis === fit ? viewState.view : initial;
  const setView = useCallback(
    (next: ViewBox | ((current: ViewBox) => ViewBox)) =>
      setViewState((s) => {
        const current = s.basis === fit ? s.view : initial;
        return { basis: fit, view: typeof next === "function" ? next(current) : next };
      }),
    [fit, initial],
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; view: ViewBox } | null>(null);

  const zoom = (factor: number) => setView((v) => zoomView(v, factor, null, fit.w * 4));
  const pan = (dx: number, dy: number) =>
    setView((v) => ({ ...v, x: v.x + dx * v.w, y: v.y + dy * v.h }));

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      setView((v) => {
        const origin = {
          x: v.x + ((event.clientX - rect.left) / Math.max(rect.width, 1)) * v.w,
          y: v.y + ((event.clientY - rect.top) / Math.max(rect.height, 1)) * v.h,
        };
        return zoomView(v, event.deltaY > 0 ? 1.12 : 1 / 1.12, origin, fit.w * 4);
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [fit, setView]);

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest("[data-entity]")) return;
    drag.current = { x: event.clientX, y: event.clientY, view };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    const svg = svgRef.current;
    if (start === null || svg === null) return;
    const rect = svg.getBoundingClientRect();
    const scale = start.view.w / Math.max(rect.width, 1);
    setView({
      ...start.view,
      x: start.view.x - (event.clientX - start.x) * scale,
      y: start.view.y - (event.clientY - start.y) * scale,
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onCanvasKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => pan(-0.1, 0),
      ArrowRight: () => pan(0.1, 0),
      ArrowUp: () => pan(0, -0.1),
      ArrowDown: () => pan(0, 0.1),
      "+": () => zoom(1 / 1.2),
      "=": () => zoom(1 / 1.2),
      "-": () => zoom(1.2),
      "0": () => setView(initial),
      f: () => setView(fit),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  const activate = (sel: Selection) => (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(sel);
    }
  };

  const dimmed = (id: string, kind: "node" | "edge") =>
    emphasis != null && !(kind === "node" ? emphasis.nodeIds : emphasis.edgeIds).has(id);

  return (
    <div className="graph-canvas">
      <div className="graph-toolbar" role="toolbar" aria-label="Graph view controls">
        <button type="button" onClick={() => zoom(1 / 1.2)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoom(1.2)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => setView(fit)}>
          Fit
        </button>
        <button type="button" onClick={() => setView(initial)}>
          Reset
        </button>
        <span className="hint">
          Drag to pan · scroll to zoom · keys: arrows, + −, F fit, 0 reset
        </span>
      </div>
      <svg
        ref={svgRef}
        role="group"
        aria-label={title}
        tabIndex={0}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMin meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onKeyDown={onCanvasKey}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="arrowhead" />
          </marker>
        </defs>
        <g className="edges">
          {edges.map((edge) => {
            const a = layout.positions.get(edge.from);
            const b = layout.positions.get(edge.to);
            if (!a || !b) return null;
            const { d, mid } = edgePath(a, b);
            const selected = selection?.kind === "edge" && selection.id === edge.id;
            const emphasized = emphasis?.edgeIds.has(edge.id) ?? false;
            const verb = EDGE_SEMANTICS[edge.type].verb;
            const name = `${labels.get(edge.from) ?? edge.from} ${verb} ${labels.get(edge.to) ?? edge.to}, ${edge.assertion}`;
            const classes = [
              "edge",
              `edge-${edge.assertion}`,
              edge.lifecycle === "revoked" ? "edge-revoked" : "",
              selected ? "is-selected" : "",
              emphasized ? "is-emphasized" : "",
              dimmed(edge.id, "edge") ? "is-dimmed" : "",
              staleIds?.has(edge.id) ? "is-stale" : "",
            ].join(" ");
            return (
              <g
                key={edge.id}
                className={classes}
                data-entity={edge.id}
                role="button"
                tabIndex={0}
                aria-label={name}
                aria-pressed={selected}
                onClick={() => onSelect({ kind: "edge", id: edge.id })}
                onKeyDown={activate({ kind: "edge", id: edge.id })}
              >
                <path d={d} className="edge-hit" />
                <path d={d} className="edge-line" markerEnd="url(#arrow)" />
                {(selected || emphasized) && (
                  <text x={mid.x} y={mid.y - 4} className="edge-label" textAnchor="middle">
                    {edge.type}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        <g className="nodes">
          {nodes.map((node) => {
            const p = layout.positions.get(node.id);
            if (!p) return null;
            const selected = selection?.kind === "node" && selection.id === node.id;
            const count = findingCounts?.get(node.id) ?? 0;
            const stale = staleIds?.has(node.id) ?? false;
            const classes = [
              "node",
              `node-${node.type}`,
              selected ? "is-selected" : "",
              dimmed(node.id, "node") ? "is-dimmed" : "",
            ].join(" ");
            return (
              <g
                key={node.id}
                className={classes}
                transform={`translate(${p.x},${p.y})`}
                data-entity={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${TYPE_LABELS[node.type]} ${node.label}${count ? `, ${count} findings` : ""}${stale ? ", stale" : ""}`}
                aria-pressed={selected}
                onClick={() => onSelect({ kind: "node", id: node.id })}
                onKeyDown={activate({ kind: "node", id: node.id })}
              >
                <title>{node.id}</title>
                <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} className="node-box" />
                <rect width={5} height={NODE_HEIGHT} rx={2} className="node-stripe" />
                <text x={14} y={17} className="node-type" aria-hidden="true">
                  {TYPE_LABELS[node.type]}
                </text>
                <text x={14} y={35} className="node-label">
                  {truncate(node.label, 24)}
                </text>
                {(count > 0 || stale) && (
                  <text x={NODE_WIDTH - 8} y={17} className="node-flags" textAnchor="end">
                    {stale ? "⧗" : ""}
                    {count > 0 ? ` ⚑${count}` : ""}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
