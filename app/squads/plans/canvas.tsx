"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { PLAN_GRID, type PlanInk, type PlanStroke, type StrokeKind } from "@/types/plan";
import { inkColor } from "./ink";
import { pathOf } from "./simplify";

/**
 * The drawing surface.
 *
 * SVG rather than a bitmap canvas, for three reasons that all matter here: a
 * stroke is a node, so rubbing one out is a click on it rather than a hit test
 * written by hand; the same markup is what the PNG and the printed sheet are
 * made of; and text stays text.
 *
 * **The stroke being drawn never goes through React.** It is one `<path>` held
 * by a ref, whose `d` is set straight on the node as the pointer moves — a
 * re-render per pointer event would drop frames on a phone, and there is
 * nothing else on screen that needs to know. It joins the committed list at the
 * pen's lift, and committed strokes never change, so each is memoised by id and
 * re-renders never touch them.
 *
 * Coordinates are the plan's grid, `0…PLAN_GRID` square. A background of
 * another shape is fitted inside it rather than stretching it: the grid is what
 * every client agrees on, and a drawing that moved when somebody swapped the
 * background would be worse than letterboxing.
 */

/** Grid units per unit of stored width, so a trace thickens as you zoom in. */
const WIDTH_SCALE = 8;

/** Grid units of text height — about twenty pixels on a thousand-pixel canvas. */
const TEXT_SIZE = 190;

export type Tool =
  | "pan"
  | "pen"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "text"
  | "token"
  | "pin"
  | "eraser";

/** The one tool whose trace is sampled rather than defined by two points. */
const FREEHAND: Record<string, boolean> = { pen: true };

export interface CanvasProps {
  strokes: PlanStroke[];
  /** The phase before this one, shown underneath. Empty when it is off. */
  ghost: PlanStroke[];
  background: { url: string; width: number; height: number } | null;
  tool: Tool;
  ink: PlanInk;
  width: number;
  hues: Map<string, string>;
  /**
   * The drawer's own squad, so the trace under their pen is already the colour
   * it will be once committed — `squad` ink resolved against nothing falls back
   * to the default hue, which in a raid is somebody else's.
   */
  mySquadId: string;
  /** `false` on a frozen phase, or for a reader the plan is closed to. */
  editable: boolean;
  /** A finished trace, in grid coordinates. */
  onDraw: (kind: StrokeKind, points: number[], text: string) => void;
  /** A trace the eraser took. */
  onErase: (strokeId: string) => void;
  className?: string;
}

export function PlanCanvas({
  strokes,
  ghost,
  background,
  tool,
  ink,
  width,
  hues,
  mySquadId,
  editable,
  onDraw,
  onErase,
  className,
}: CanvasProps) {
  const svg = useRef<SVGSVGElement | null>(null);
  const live = useRef<SVGPathElement | null>(null);

  /** The trace in progress, outside React on purpose. */
  const points = useRef<number[]>([]);
  const drawing = useRef(false);

  const [view, setView] = useState({ x: 0, y: 0, size: PLAN_GRID });
  const panFrom = useRef<{ x: number; y: number; vx: number; vy: number } | null>(
    null,
  );

  /** Where a click asked for a label, in grid coordinates. */
  const [typing, setTyping] = useState<{ x: number; y: number } | null>(null);
  const [label, setLabel] = useState("");

  /** A client point, in the plan's grid. */
  const at = useCallback((event: React.PointerEvent): [number, number] => {
    const node = svg.current;
    if (!node) return [0, 0];

    const matrix = node.getScreenCTM();
    if (!matrix) return [0, 0];

    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );

    return [point.x, point.y];
  }, []);

  const paint = useCallback(
    (kind: Tool, from: number[], to: number[]): string => {
      if (kind === "pen") return pathOf(points.current);

      const [x0, y0] = from;
      const [x1, y1] = to;

      if (kind === "rect") {
        const x = Math.min(x0, x1);
        const y = Math.min(y0, y1);
        return `M ${x} ${y} h ${Math.abs(x1 - x0)} v ${Math.abs(y1 - y0)} h ${-Math.abs(x1 - x0)} Z`;
      }

      if (kind === "ellipse") {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const rx = Math.abs(x1 - x0) / 2;
        const ry = Math.abs(y1 - y0) / 2;
        return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
      }

      return `M ${x0} ${y0} L ${x1} ${y1}`;
    },
    [],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;

      const [x, y] = at(event);

      if (tool === "pan") {
        panFrom.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      if (!editable) return;

      if (tool === "text" || tool === "pin") {
        setTyping({ x: Math.round(x), y: Math.round(y) });
        setLabel("");
        return;
      }

      if (tool === "token") {
        onDraw("token", [Math.round(x), Math.round(y)], "");
        return;
      }

      if (tool === "eraser") return;

      drawing.current = true;
      points.current = [x, y];
      event.currentTarget.setPointerCapture(event.pointerId);

      if (live.current) {
        live.current.setAttribute("d", paint(tool, [x, y], [x, y]));
      }
    },
    [at, editable, onDraw, paint, tool, view.x, view.y],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (panFrom.current) {
        const from = panFrom.current;
        const node = svg.current;
        if (!node) return;

        // One screen pixel is `size / width` grid units, whatever the zoom.
        const scale = view.size / node.clientWidth;

        setView((current) => ({
          ...current,
          x: from.vx - (event.clientX - from.x) * scale,
          y: from.vy - (event.clientY - from.y) * scale,
        }));
        return;
      }

      if (!drawing.current) return;

      const [x, y] = at(event);

      if (FREEHAND[tool]) {
        // Every intermediate position the browser coalesced, so a fast trace
        // keeps its shape instead of turning into three long segments.
        const moves = event.nativeEvent.getCoalescedEvents?.() ?? [];

        if (moves.length > 0) {
          for (const move of moves) {
            const matrix = svg.current?.getScreenCTM();
            if (!matrix) continue;

            const point = new DOMPoint(move.clientX, move.clientY).matrixTransform(
              matrix.inverse(),
            );
            points.current.push(point.x, point.y);
          }
        } else {
          points.current.push(x, y);
        }
      }

      if (live.current) {
        live.current.setAttribute(
          "d",
          paint(tool, [points.current[0], points.current[1]], [x, y]),
        );
      }
    },
    [at, paint, tool, view.size],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (panFrom.current) {
        panFrom.current = null;
        return;
      }

      if (!drawing.current) return;
      drawing.current = false;

      const [x, y] = at(event);
      const from = [points.current[0], points.current[1]];

      const trace = FREEHAND[tool] ? points.current : [...from, x, y];

      points.current = [];
      live.current?.setAttribute("d", "");

      // A tap with a shape tool is not a shape; it is a slip.
      const moved =
        Math.abs(x - from[0]) > PLAN_GRID / 400 ||
        Math.abs(y - from[1]) > PLAN_GRID / 400;

      if (!moved && !FREEHAND[tool]) return;
      if (trace.length < 4) return;

      onDraw(tool as StrokeKind, trace, "");
    },
    [at, onDraw, tool],
  );

  /** Wheel zooms about the pointer, so the plan does not slide away under it. */
  useEffect(() => {
    const node = svg.current;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      const box = node.getBoundingClientRect();
      const fx = (event.clientX - box.left) / box.width;
      const fy = (event.clientY - box.top) / box.height;

      setView((current) => {
        const size = Math.max(
          PLAN_GRID / 12,
          Math.min(PLAN_GRID, current.size * (event.deltaY > 0 ? 1.12 : 0.89)),
        );

        return {
          size,
          x: current.x + (current.size - size) * fx,
          y: current.y + (current.size - size) * fy,
        };
      });
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const fitted = background ? fit(background) : null;

  return (
    <div className={cn("relative overflow-hidden bg-[#061E30]", className)}>
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
        className="absolute inset-0 size-full touch-none select-none"
        style={{ cursor: cursorFor(tool, editable) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern
            id="plan-grid"
            width={PLAN_GRID / 40}
            height={PLAN_GRID / 40}
            patternUnits="userSpaceOnUse"
          >
            <circle cx="6" cy="6" r="6" fill="#9ED0FF" opacity="0.13" />
          </pattern>
        </defs>

        <rect width={PLAN_GRID} height={PLAN_GRID} fill="url(#plan-grid)" />

        {fitted ? (
          <image
            href={background!.url}
            x={fitted.x}
            y={fitted.y}
            width={fitted.width}
            height={fitted.height}
            preserveAspectRatio="none"
            // The export rasterises this node; without it the canvas is tainted
            // and `toBlob` throws instead of answering.
            crossOrigin="anonymous"
          />
        ) : null}

        {/* The phase before, so the room sees where the squad came from. */}
        <g opacity={0.22} pointerEvents="none">
          {ghost.map((stroke) => (
            <Trace key={stroke.id} stroke={stroke} hues={hues} />
          ))}
        </g>

        <g>
          {strokes.map((stroke) => (
            <Trace
              key={stroke.id}
              stroke={stroke}
              hues={hues}
              onErase={tool === "eraser" && editable ? onErase : undefined}
            />
          ))}
        </g>

        {/* The trace under the pen. Never re-rendered; written to directly. */}
        <path
          ref={live}
          fill="none"
          stroke={inkColor(ink, mySquadId, hues)}
          strokeWidth={width * WIDTH_SCALE}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      </svg>

      {typing ? (
        <LabelField
          value={label}
          onChange={setLabel}
          onDone={(text) => {
            const anchor = typing;
            setTyping(null);
            if (text.trim()) {
              onDraw(tool === "pin" ? "pin" : "text", [anchor.x, anchor.y], text.trim());
            }
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * A committed trace.
 *
 * Memoised by identity: a committed stroke is never mutated — a move or an
 * erase supersedes it under a new revision and arrives as a different object —
 * so this re-renders exactly when something about it actually changed.
 */
export const Trace = memo(function Trace({
  stroke,
  hues,
  onErase,
}: {
  stroke: PlanStroke;
  hues: Map<string, string>;
  onErase?: (strokeId: string) => void;
}) {
  const color = inkColor(stroke.ink, stroke.squadId, hues);
  const thickness = stroke.width * WIDTH_SCALE;
  const [x0, y0, x1, y1] = stroke.points;

  const erase = onErase
    ? {
        onPointerDown: (event: React.PointerEvent) => {
          // The primary button only, as the pen is: a right-click is a menu
          // somebody asked for, not a trace they meant to lose.
          if (event.button !== 0) return;

          event.stopPropagation();
          onErase(stroke.id);
        },
        style: { cursor: "pointer" as const },
      }
    : {};

  const line = {
    fill: "none",
    stroke: color,
    strokeWidth: thickness,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (stroke.kind === "pen") {
    return <path d={pathOf(stroke.points)} {...line} {...erase} />;
  }

  if (stroke.kind === "line" || stroke.kind === "arrow") {
    const head =
      stroke.kind === "arrow" ? arrowHead(x0, y0, x1, y1, thickness) : null;

    return (
      <g {...erase}>
        <line x1={x0} y1={y0} x2={x1} y2={y1} {...line} />
        {head ? <path d={head} fill={color} stroke="none" /> : null}
      </g>
    );
  }

  if (stroke.kind === "rect") {
    return (
      <rect
        x={Math.min(x0, x1)}
        y={Math.min(y0, y1)}
        width={Math.abs(x1 - x0)}
        height={Math.abs(y1 - y0)}
        {...line}
        {...erase}
      />
    );
  }

  if (stroke.kind === "ellipse") {
    return (
      <ellipse
        cx={(x0 + x1) / 2}
        cy={(y0 + y1) / 2}
        rx={Math.abs(x1 - x0) / 2}
        ry={Math.abs(y1 - y0) / 2}
        {...line}
        {...erase}
      />
    );
  }

  if (stroke.kind === "text") {
    return (
      <text
        x={x0}
        y={y0}
        fill={color}
        fontSize={TEXT_SIZE}
        fontWeight={600}
        // The rasteriser has no webfont; naming a generic family keeps the
        // exported glyphs the same shape as the ones on screen.
        fontFamily="sans-serif"
        {...erase}
      >
        {stroke.text}
      </text>
    );
  }

  // A token or a role marker: a disc with a label under it.
  const radius = TEXT_SIZE * 0.9;

  return (
    <g {...erase}>
      <circle
        cx={x0}
        cy={y0}
        r={radius}
        fill="#061E30"
        stroke={color}
        strokeWidth={thickness}
      />
      <text
        x={x0}
        y={y0 + TEXT_SIZE * 0.3}
        fill={color}
        fontSize={TEXT_SIZE * 0.8}
        fontWeight={700}
        fontFamily="sans-serif"
        textAnchor="middle"
      >
        {initials(stroke.text || stroke.authorName)}
      </text>
      <text
        x={x0}
        y={y0 + radius + TEXT_SIZE}
        fill="#CCE7FF"
        fontSize={TEXT_SIZE * 0.85}
        fontWeight={600}
        fontFamily="sans-serif"
        textAnchor="middle"
      >
        {stroke.text || stroke.authorName}
      </text>
    </g>
  );
});

/** The label a `text` or a `pin` is waiting for, typed where it was asked for. */
function LabelField({
  value,
  onChange,
  onDone,
}: {
  value: string;
  onChange: (value: string) => void;
  onDone: (value: string) => void;
}) {
  const t = useTranslations("Plans");

  return (
    <div className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-lg border border-[#9ED0FF]/25 bg-[#0B3A5A]/95 p-2 sm:inset-x-auto sm:left-1/2 sm:w-96 sm:-translate-x-1/2">
      <input
        autoFocus
        aria-label={t("labelField")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onDone(value);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onDone("");
          }
        }}
        onBlur={() => onDone(value)}
        className="min-h-9 flex-1 rounded-md border border-[#9ED0FF]/25 bg-[#061E30]/60 px-2 text-sm text-[#CCE7FF] outline-none"
      />
    </div>
  );
}

/** The background, fitted inside the square grid rather than stretching it. */
function fit(background: { width: number; height: number }) {
  const ratio = background.width / background.height;

  const width = ratio >= 1 ? PLAN_GRID : PLAN_GRID * ratio;
  const height = ratio >= 1 ? PLAN_GRID / ratio : PLAN_GRID;

  return {
    x: (PLAN_GRID - width) / 2,
    y: (PLAN_GRID - height) / 2,
    width,
    height,
  };
}

/** A filled triangle at the far end of an arrow, in the line's own thickness. */
function arrowHead(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
): string {
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const size = thickness * 3;
  const spread = 0.42;

  const ax = x1 - size * Math.cos(angle - spread);
  const ay = y1 - size * Math.sin(angle - spread);
  const bx = x1 - size * Math.cos(angle + spread);
  const by = y1 - size * Math.sin(angle + spread);

  return `M ${x1} ${y1} L ${ax} ${ay} L ${bx} ${by} Z`;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function cursorFor(tool: Tool, editable: boolean): string {
  if (tool === "pan") return "grab";
  if (!editable) return "default";
  if (tool === "eraser") return "pointer";
  return "crosshair";
}
