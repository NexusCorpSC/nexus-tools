"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import {
  PLAN_GRID,
  wearsDash,
  type PlanInk,
  type PlanStroke,
  type StrokeDash,
  type StrokeKind,
} from "@/types/plan";
import { inkColor } from "./ink";
import { pathOf } from "./simplify";

/**
 * The drawing surface.
 *
 * SVG rather than a bitmap canvas, for three reasons that all matter here: a
 * stroke is a node, so rubbing one out is a pointer on it rather than a hit test
 * written by hand; the same markup is what the PNG and the printed sheet are
 * made of; and text stays text.
 *
 * **The stroke being drawn never goes through React.** It is two `<path>` nodes
 * held by refs — a shaft and an arrow head — whose `d` is set straight on the
 * node as the pointer moves. A re-render per pointer event would drop frames on
 * a phone, and there is nothing else on screen that needs to know. They join the
 * committed list at the pen's lift, and committed strokes never change, so each
 * is memoised by id and re-renders never touch them.
 *
 * Coordinates are the plan's grid, `0…PLAN_GRID` square, and **the square is
 * drawn**: the window is not square, so at any zoom there are margins that are
 * not part of the plan. They used to accept a trace and fold it onto the edge
 * behind the drawer's back — which is why a rectangle never landed where it was
 * put. The sheet now has a visible border, the margins are dimmed, and `at()`
 * clamps, so the preview under the pointer and the trace that is stored are the
 * same shape.
 */

/** Grid units per unit of stored width, so a trace thickens as you zoom in. */
const WIDTH_SCALE = 8;

/** Grid units of text height — about twenty pixels on a thousand-pixel canvas. */
const TEXT_SIZE = 190;

/**
 * How much wider than its ink a trace is to a pointer holding the eraser.
 *
 * A trace of the thinnest width is twenty-four grid units across — under two
 * pixels on a seven-hundred-pixel sheet, which is not something a hand can be
 * asked to follow. So while the eraser is out every trace is drawn a second
 * time in transparent ink at this much more, and *that* is what the pointer
 * meets. About eight pixels, which is a brush rather than a needle.
 */
const HIT_PAD = 110;

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

/** The tools that place a glyph: no dash, and no shape to preview. */
const GLYPH: Record<string, boolean> = { text: true, token: true, pin: true };

/**
 * The dash pattern of a trace, in the trace's own thickness.
 *
 * Both patterns are multiples of the thickness rather than fixed lengths: a fat
 * trace spaced for a thin one reads as a solid line with accidents in it. And
 * both are drawn under the round cap the whole canvas uses, which is what the
 * numbers answer to:
 *
 * - **dotted** is the zero-length dash: a dash of `0` under a round cap paints a
 *   disc one thickness across, and a gap of twice the thickness leaves exactly
 *   one thickness of air between two discs.
 * - **dashed** is two thicknesses on and three off; the cap adds half a
 *   thickness at each end of every dash, so what is *seen* is three of ink and
 *   two of air.
 *
 * `undefined` for a plain line, so React drops the attribute entirely and the
 * printed sheet keeps the exact node it had before dashes existed.
 */
export function dashFor(
  dash: StrokeDash,
  thickness: number,
): string | undefined {
  if (dash === "dashed") return `${thickness * 2} ${thickness * 3}`;
  if (dash === "dotted") return `0 ${thickness * 2}`;

  return undefined;
}

export interface CanvasProps {
  strokes: PlanStroke[];
  /** The phase before this one, shown underneath. Empty when it is off. */
  ghost: PlanStroke[];
  background: { url: string; width: number; height: number } | null;
  tool: Tool;
  ink: PlanInk;
  width: number;
  /** The dash the trace under the pointer will be committed with. */
  dash: StrokeDash;
  hues: Map<string, string>;
  /**
   * The drawer's own squad, so the trace under their pen is already the colour
   * it will be once committed — `squad` ink resolved against nothing falls back
   * to the default hue, which in a raid is somebody else's.
   */
  mySquadId: string;
  /** `false` on a frozen phase, or for a reader the plan is closed to. */
  editable: boolean;
  /**
   * A finished trace, in grid coordinates.
   *
   * Answers the committed stroke, because a marker is dropped before it is
   * named: the label field needs the id the server minted to send the name
   * after it.
   */
  onDraw: (
    kind: StrokeKind,
    points: number[],
    text: string,
  ) => Promise<PlanStroke | null>;
  /** A marker named after the fact. */
  onRelabel: (strokeId: string, text: string) => void;
  /** A trace the eraser took. */
  onErase: (strokeId: string) => void;
  className?: string;
}

/** What the label field is waiting for, and what it will do with it. */
interface Typing {
  x: number;
  y: number;
  /**
   * The marker already on its way to the server, for a `pin`.
   *
   * A pin is dropped by the click and named afterwards — holding the marker
   * back until somebody has typed is what made the tool look dead. So the
   * commit leaves at once and the field, when it is validated, waits on this
   * to learn the id it has to rename. `null` for the text tool, which has
   * nothing to place until there are words to place.
   */
  naming: Promise<PlanStroke | null> | null;
}

export function PlanCanvas({
  strokes,
  ghost,
  background,
  tool,
  ink,
  width,
  dash,
  hues,
  mySquadId,
  editable,
  onDraw,
  onRelabel,
  onErase,
  className,
}: CanvasProps) {
  const svg = useRef<SVGSVGElement | null>(null);
  const live = useRef<SVGPathElement | null>(null);
  const liveHead = useRef<SVGPathElement | null>(null);

  /** The trace in progress, outside React on purpose. */
  const points = useRef<number[]>([]);
  const drawing = useRef(false);

  /**
   * The eraser, held down.
   *
   * **Nothing captures the pointer while this is true**, and that is the whole
   * trick: a captured pointer sends every event to the element that captured
   * it, so the `pointerenter` of the traces being swept over would never fire
   * and the eraser would go back to erasing one trace per click.
   */
  const rubbing = useRef(false);

  /** Where a tap that may become a label started. */
  const tapFrom = useRef<{ x: number; y: number } | null>(null);

  const [view, setView] = useState({ x: 0, y: 0, size: PLAN_GRID });
  const panFrom = useRef<{ x: number; y: number; vx: number; vy: number } | null>(
    null,
  );

  /** Where a click asked for a label, in grid coordinates. */
  const [typing, setTyping] = useState<Typing | null>(null);
  const [label, setLabel] = useState("");

  /** A client point, on the sheet — never outside it. */
  const toSheet = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const matrix = svg.current?.getScreenCTM();
      if (!matrix) return [0, 0];

      const point = new DOMPoint(clientX, clientY).matrixTransform(
        matrix.inverse(),
      );

      return [
        Math.max(0, Math.min(PLAN_GRID, point.x)),
        Math.max(0, Math.min(PLAN_GRID, point.y)),
      ];
    },
    [],
  );

  const at = useCallback(
    (event: React.PointerEvent): [number, number] =>
      toSheet(event.clientX, event.clientY),
    [toSheet],
  );

  /** The shaft and the head of whatever is under the pointer right now. */
  const paint = useCallback(
    (kind: Tool, from: number[], to: number[]): { shaft: string; head: string } => {
      if (kind === "pen") return { shaft: pathOf(points.current), head: "" };

      const [x0, y0] = from;
      const [x1, y1] = to;

      if (kind === "rect") {
        const x = Math.min(x0, x1);
        const y = Math.min(y0, y1);
        return { shaft: rectPath(x, y, Math.abs(x1 - x0), Math.abs(y1 - y0)), head: "" };
      }

      if (kind === "ellipse") {
        return { shaft: ellipsePath(x0, y0, x1, y1), head: "" };
      }

      if (kind === "arrow") {
        return arrowPath(x0, y0, x1, y1, width * WIDTH_SCALE);
      }

      return { shaft: `M ${x0} ${y0} L ${x1} ${y1}`, head: "" };
    },
    [width],
  );

  const show = useCallback((drawn: { shaft: string; head: string }) => {
    live.current?.setAttribute("d", drawn.shaft);
    liveHead.current?.setAttribute("d", drawn.head);
  }, []);

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

      if (tool === "eraser") {
        // No capture: see `rubbing`.
        rubbing.current = true;
        return;
      }

      if (tool === "text" || tool === "pin") {
        // The field is opened by the *release*, never by the press. React
        // flushes a pointerdown synchronously, so a field mounted here is
        // focused before the browser has run the mousedown that follows — and
        // that mousedown then moves the focus straight back out. The field
        // blinked and vanished, which is the whole of «le texte ne marche pas».
        if (!typing) tapFrom.current = { x, y };
        return;
      }

      if (tool === "token") {
        void onDraw("token", [Math.round(x), Math.round(y)], "");
        return;
      }

      drawing.current = true;
      points.current = [x, y];
      event.currentTarget.setPointerCapture(event.pointerId);

      show(paint(tool, [x, y], [x, y]));
    },
    [at, editable, onDraw, paint, show, tool, typing, view.x, view.y],
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
            const [mx, my] = toSheet(move.clientX, move.clientY);
            points.current.push(mx, my);
          }
        } else {
          points.current.push(x, y);
        }
      }

      show(paint(tool, [points.current[0], points.current[1]], [x, y]));
    },
    [at, paint, show, toSheet, tool, view.size],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      rubbing.current = false;

      if (panFrom.current) {
        panFrom.current = null;
        return;
      }

      const [x, y] = at(event);

      if (tapFrom.current) {
        const from = tapFrom.current;
        tapFrom.current = null;

        // A tap that wandered is somebody who changed their mind.
        if (
          Math.abs(x - from.x) > PLAN_GRID / 200 ||
          Math.abs(y - from.y) > PLAN_GRID / 200
        ) {
          return;
        }

        const anchor = [Math.round(from.x), Math.round(from.y)];

        setTyping({
          x: anchor[0],
          y: anchor[1],
          naming: tool === "pin" ? onDraw("pin", anchor, "") : null,
        });
        setLabel("");
        return;
      }

      if (!drawing.current) return;
      drawing.current = false;

      const from = [points.current[0], points.current[1]];
      const trace = FREEHAND[tool] ? points.current : [...from, x, y];

      points.current = [];
      show({ shaft: "", head: "" });

      // A tap with a shape tool is not a shape; it is a slip.
      const moved =
        Math.abs(x - from[0]) > PLAN_GRID / 400 ||
        Math.abs(y - from[1]) > PLAN_GRID / 400;

      if (!moved && !FREEHAND[tool]) return;
      if (trace.length < 4) return;

      void onDraw(tool as StrokeKind, trace, "");
    },
    [at, onDraw, show, tool],
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

  /** Whether the eraser is down, read by every trace without re-rendering one. */
  const held = useCallback(() => rubbing.current, []);

  const fitted = background ? fit(background) : null;
  const erasing = tool === "eraser" && editable;

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
        onPointerLeave={() => {
          rubbing.current = false;
        }}
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
              held={held}
              onErase={erasing ? onErase : undefined}
            />
          ))}
        </g>

        {/* The trace under the pointer. Never re-rendered; written to directly. */}
        <path
          ref={live}
          fill="none"
          stroke={inkColor(ink, mySquadId, hues)}
          strokeWidth={width * WIDTH_SCALE}
          strokeDasharray={
            GLYPH[tool] ? undefined : dashFor(dash, width * WIDTH_SCALE)
          }
          strokeLinecap={tool === "arrow" ? "butt" : "round"}
          strokeLinejoin="round"
          pointerEvents="none"
        />
        <path
          ref={liveHead}
          fill={inkColor(ink, mySquadId, hues)}
          stroke="none"
          pointerEvents="none"
        />

        {/*
          Where the plan stops.
          The window is not square and the sheet is, so there are always margins
          that belong to no plan. Dimming them and drawing the edge is what
          stops somebody putting a rectangle half outside it and wondering why
          it came back a different shape.
        */}
        <g pointerEvents="none" fill="#061E30" opacity={0.55}>
          <rect x={-2 * PLAN_GRID} y={-2 * PLAN_GRID} width={5 * PLAN_GRID} height={2 * PLAN_GRID} />
          <rect x={-2 * PLAN_GRID} y={PLAN_GRID} width={5 * PLAN_GRID} height={2 * PLAN_GRID} />
          <rect x={-2 * PLAN_GRID} y={0} width={2 * PLAN_GRID} height={PLAN_GRID} />
          <rect x={PLAN_GRID} y={0} width={2 * PLAN_GRID} height={PLAN_GRID} />
        </g>

        <rect
          width={PLAN_GRID}
          height={PLAN_GRID}
          fill="none"
          stroke="#9ED0FF"
          strokeOpacity={0.25}
          strokeWidth={16}
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

            const said = text.trim();

            if (anchor.naming) {
              // The marker is already down. Naming it is a second, smaller
              // write, and saying nothing leaves it wearing its author's
              // initials — which is a marker, not a mistake.
              if (!said) return;

              void anchor.naming.then((stroke) => {
                if (stroke) onRelabel(stroke.id, said);
              });
              return;
            }

            if (said) void onDraw("text", [anchor.x, anchor.y], said);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * A committed trace.
 *
 * Memoised by identity: a committed stroke is never mutated — a move, a rename
 * or an erase supersedes it under a new revision and arrives as a different
 * object — so this re-renders exactly when something about it actually changed.
 *
 * When the eraser is out, every trace is drawn **twice**: the ink, and then the
 * same geometry in transparent ink several times wider, which is what the
 * pointer actually meets. A two-pixel line is not something a hand can be asked
 * to land on, let alone follow while sweeping.
 */
export const Trace = memo(function Trace({
  stroke,
  hues,
  held,
  onErase,
}: {
  stroke: PlanStroke;
  hues: Map<string, string>;
  /** Whether the eraser is being held down right now. */
  held?: () => boolean;
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
        // The gomme rubs where it is dragged, not only where it is clicked.
        // Reached because nothing captured the pointer — see `rubbing`.
        onPointerEnter: (event: React.PointerEvent) => {
          if (!held?.()) return;

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
    strokeDasharray: wearsDash(stroke.kind)
      ? dashFor(stroke.dash, thickness)
      : undefined,
  };

  /** The same shape, wide and invisible, to be swept over. Solid: a dashed
   *  trace is one trace, and its holes are not holes in it. */
  const grip = onErase
    ? {
        fill: "none",
        stroke: "transparent",
        strokeWidth: thickness + HIT_PAD,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        pointerEvents: "stroke" as const,
      }
    : null;

  if (stroke.kind === "pen") {
    const d = pathOf(stroke.points);

    return (
      <g {...erase}>
        <path d={d} {...line} />
        {grip ? <path d={d} {...grip} /> : null}
      </g>
    );
  }

  if (stroke.kind === "line" || stroke.kind === "arrow") {
    const shaftToTip = `M ${x0} ${y0} L ${x1} ${y1}`;
    const drawn =
      stroke.kind === "arrow"
        ? arrowPath(x0, y0, x1, y1, thickness)
        : { shaft: shaftToTip, head: "" };

    return (
      <g {...erase}>
        <path
          d={drawn.shaft}
          {...line}
          // The shaft stops at the head's notch, so a round cap would put a
          // blob through the point of the arrow.
          strokeLinecap={stroke.kind === "arrow" ? "butt" : "round"}
        />
        {drawn.head ? (
          <path d={drawn.head} fill={color} stroke="none" />
        ) : null}
        {grip ? <path d={shaftToTip} {...grip} /> : null}
      </g>
    );
  }

  if (stroke.kind === "rect" || stroke.kind === "ellipse") {
    const d =
      stroke.kind === "rect"
        ? rectPath(
            Math.min(x0, x1),
            Math.min(y0, y1),
            Math.abs(x1 - x0),
            Math.abs(y1 - y0),
          )
        : ellipsePath(x0, y0, x1, y1);

    return (
      <g {...erase}>
        <path d={d} {...line} />
        {grip ? <path d={d} {...grip} /> : null}
      </g>
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
        // A halo of transparent ink behind the glyphs, so the eraser catches
        // the word rather than the inside of an «o».
        {...(grip
          ? {
              stroke: "transparent",
              strokeWidth: HIT_PAD,
              paintOrder: "stroke" as const,
            }
          : {})}
        {...erase}
      >
        {stroke.text}
      </text>
    );
  }

  // A token or a role marker: a disc with a label under it. A marker wears its
  // author's initials until somebody names it, which is what lets it be dropped
  // in one click and named in a second gesture.
  const radius = TEXT_SIZE * 0.9;

  return (
    <g {...erase}>
      {grip ? (
        <circle cx={x0} cy={y0} r={radius + HIT_PAD / 2} fill="transparent" />
      ) : null}
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
      {stroke.text ? (
        <text
          x={x0}
          y={y0 + radius + TEXT_SIZE}
          fill="#CCE7FF"
          fontSize={TEXT_SIZE * 0.85}
          fontWeight={600}
          fontFamily="sans-serif"
          textAnchor="middle"
        >
          {stroke.text}
        </text>
      ) : null}
    </g>
  );
});

/**
 * The label a `text` or a `pin` is waiting for.
 *
 * **Blurring validates nothing.** It used to, and between the browser moving the
 * focus off a freshly mounted field and a phone closing its keyboard, that meant
 * the field closed itself before anybody had typed into it. What closes it now
 * is a button, a key, or nothing.
 */
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
  const field = useRef<HTMLInputElement | null>(null);

  // After the gesture that opened it, never during: a focus set inside the
  // pointer handling is taken back by the browser's own default action.
  useEffect(() => {
    const frame = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onDone(value);
      }}
      className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-lg border border-[#9ED0FF]/25 bg-[#0B3A5A]/95 p-2 shadow-lg shadow-black/35 sm:inset-x-auto sm:left-1/2 sm:w-96 sm:-translate-x-1/2"
    >
      <input
        ref={field}
        aria-label={t("labelField")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onDone("");
          }
        }}
        className="min-h-11 flex-1 rounded-md border border-[#9ED0FF]/25 bg-[#061E30]/60 px-2 text-sm text-[#CCE7FF] outline-none"
      />
      <button
        type="submit"
        className="min-h-11 shrink-0 rounded-md bg-[#9ED0FF]/20 px-3 text-sm font-semibold text-[#CCE7FF] hover:bg-[#9ED0FF]/30"
      >
        {t("labelPlace")}
      </button>
      <button
        type="button"
        onClick={() => onDone("")}
        className="min-h-11 shrink-0 rounded-md px-3 text-sm text-[#9ED0FF]/70 hover:text-[#CCE7FF]"
      >
        {t("labelCancel")}
      </button>
    </form>
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

function rectPath(x: number, y: number, width: number, height: number): string {
  return `M ${x} ${y} h ${width} v ${height} h ${-width} Z`;
}

function ellipsePath(x0: number, y0: number, x1: number, y1: number): string {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;

  return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
}

/**
 * An arrow, as a shaft and a head.
 *
 * The old one was a flat triangle three thicknesses long, which at the usual
 * width is ten pixels of point on a line somebody was meant to read across a
 * room — and the shaft ran all the way to the tip, so its round cap poked out
 * through the point. This one is bigger, **notched** so it reads as a head and
 * not as an accent, and the shaft stops at the notch.
 *
 * Capped at a third of the arrow's own length: a short arrow should be a short
 * arrow, not a head with nothing behind it.
 */
function arrowPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
): { shaft: string; head: string } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);

  if (length < 1) return { shaft: "", head: "" };

  const ux = dx / length;
  const uy = dy / length;

  const size = Math.min(
    Math.max(thickness * 4, 150),
    Math.max(length / 3, thickness),
  );

  // Across the axis, for the wings.
  const px = -uy;
  const py = ux;
  const half = size * 0.46;

  const bx = x1 - ux * size;
  const by = y1 - uy * size;
  const nx = x1 - ux * size * 0.72;
  const ny = y1 - uy * size * 0.72;

  const at = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;

  return {
    shaft: `M ${at(x0, y0)} L ${at(nx, ny)}`,
    head: `M ${at(x1, y1)} L ${at(bx + px * half, by + py * half)} L ${at(nx, ny)} L ${at(bx - px * half, by - py * half)} Z`,
  };
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
