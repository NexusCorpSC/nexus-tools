"use client";

import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Hand,
  MapPin,
  Minus,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  STROKE_DASHES,
  STROKE_WIDTHS,
  type PlanInk,
  type StrokeDash,
} from "@/types/plan";
import type { Tool } from "./canvas";
import { inkSwatches } from "./ink";

/**
 * The tools, the ink and the thickness.
 *
 * A rail down the left on a desktop, a bar along the bottom on a phone — the
 * same list either way, at the same forty-four pixels a thumb needs. The ink
 * swatches lead with `squad`, which is the one most people will leave selected:
 * a plan where each squad's traces wear the squad's own colour reads itself.
 */

const TOOLS: { tool: Tool; icon: typeof Pencil; key: string }[] = [
  { tool: "pan", icon: Hand, key: "toolPan" },
  { tool: "pen", icon: Pencil, key: "toolPen" },
  { tool: "arrow", icon: ArrowUpRight, key: "toolArrow" },
  { tool: "line", icon: Minus, key: "toolLine" },
  { tool: "rect", icon: Square, key: "toolRect" },
  { tool: "ellipse", icon: Circle, key: "toolEllipse" },
  { tool: "text", icon: Type, key: "toolText" },
  { tool: "token", icon: Users, key: "toolToken" },
  { tool: "pin", icon: MapPin, key: "toolPin" },
  { tool: "eraser", icon: Eraser, key: "toolEraser" },
];

/** The tools that place a glyph: a dotted disc reads as a rendering fault. */
const GLYPH: Record<string, boolean> = { text: true, token: true, pin: true };

/** The same ratios `dashFor` uses, at a thickness of 2.5: the button is its own
 *  preview rather than an icon that has to be learned. */
const PREVIEW: Record<StrokeDash, string | undefined> = {
  solid: undefined,
  dashed: "5 7.5",
  dotted: "0 5",
};

export function Toolbar({
  tool,
  ink,
  width,
  dash,
  hues,
  mySquadId,
  editable,
  canUndo,
  canRedo,
  onTool,
  onInk,
  onWidth,
  onDash,
  onUndo,
  onRedo,
  className,
}: {
  tool: Tool;
  ink: PlanInk;
  width: number;
  dash: StrokeDash;
  hues: Map<string, string>;
  mySquadId: string;
  editable: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTool: (tool: Tool) => void;
  onInk: (ink: PlanInk) => void;
  onWidth: (width: number) => void;
  onDash: (dash: StrokeDash) => void;
  onUndo: () => void;
  onRedo: () => void;
  className?: string;
}) {
  const t = useTranslations("Plans");

  return (
    <nav
      aria-label={t("tools")}
      className={cn(
        "flex shrink-0 items-center gap-1 border-[#9ED0FF]/15 bg-[#0B3A5A] p-1",
        "overflow-x-auto border-t md:h-full md:flex-col md:overflow-y-auto md:overflow-x-visible md:border-r md:border-t-0 md:py-2",
        className,
      )}
    >
      {/* Actions, not modes: no `aria-pressed`, and the first thing a hand
          reaches for after a slip. */}
      {(
        [
          { key: "undo", icon: Undo2, run: onUndo, live: canUndo },
          { key: "redo", icon: Redo2, run: onRedo, live: canRedo },
        ] as const
      ).map(({ key, icon: Icon, run, live }) => (
        <button
          key={key}
          type="button"
          title={`${t(key)} (${t(`${key}Shortcut`)})`}
          disabled={!live}
          onClick={run}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg transition md:size-10",
            "text-[#9ED0FF]/60 hover:bg-[#9ED0FF]/10 hover:text-[#CCE7FF]",
            !live && "cursor-default opacity-30 hover:bg-transparent",
          )}
        >
          <span className="sr-only">{t(key)}</span>
          <Icon className="size-5" aria-hidden="true" />
        </button>
      ))}

      <span className="mx-1 h-6 w-px shrink-0 bg-[#9ED0FF]/15 md:mx-0 md:my-1 md:h-px md:w-6" />

      {TOOLS.map(({ tool: candidate, icon: Icon, key }) => {
        const chosen = candidate === tool;
        // Panning is reading, not drawing: it stays on for everyone.
        const usable = editable || candidate === "pan";

        return (
          <button
            key={candidate}
            type="button"
            title={t(key)}
            disabled={!usable}
            aria-pressed={chosen}
            onClick={() => onTool(candidate)}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-lg transition md:size-10",
              chosen
                ? "bg-[#9ED0FF]/25 text-[#CCE7FF]"
                : "text-[#9ED0FF]/60 hover:bg-[#9ED0FF]/10 hover:text-[#CCE7FF]",
              !usable && "cursor-default opacity-30 hover:bg-transparent",
            )}
          >
            <span className="sr-only">{t(key)}</span>
            <Icon className="size-5" aria-hidden="true" />
          </button>
        );
      })}

      <span className="mx-1 h-6 w-px shrink-0 bg-[#9ED0FF]/15 md:mx-0 md:my-1 md:h-px md:w-6" />

      {inkSwatches(mySquadId, hues).map((swatch) => (
        <button
          key={swatch.ink}
          type="button"
          title={t(`ink_${swatch.ink}`)}
          disabled={!editable}
          aria-pressed={swatch.ink === ink}
          onClick={() => onInk(swatch.ink)}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg transition md:size-10",
            swatch.ink === ink ? "bg-[#9ED0FF]/20" : "hover:bg-[#9ED0FF]/10",
            !editable && "cursor-default opacity-30",
          )}
        >
          <span className="sr-only">{t(`ink_${swatch.ink}`)}</span>
          <span
            className="size-4 rounded-full"
            style={{
              background: swatch.color,
              boxShadow:
                swatch.ink === ink
                  ? `0 0 0 2px #0B3A5A, 0 0 0 4px ${swatch.color}`
                  : undefined,
            }}
          />
        </button>
      ))}

      <span className="mx-1 h-6 w-px shrink-0 bg-[#9ED0FF]/15 md:mx-0 md:my-1 md:h-px md:w-6" />

      {STROKE_WIDTHS.map((candidate) => (
        <button
          key={candidate}
          type="button"
          title={t("thickness")}
          disabled={!editable}
          aria-pressed={candidate === width}
          onClick={() => onWidth(candidate)}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg transition md:size-10",
            candidate === width
              ? "bg-[#9ED0FF]/20 text-[#CCE7FF]"
              : "text-[#9ED0FF]/60 hover:bg-[#9ED0FF]/10",
            !editable && "cursor-default opacity-30",
          )}
        >
          <span className="sr-only">{t("thickness")}</span>
          <span
            className="rounded-full bg-current"
            style={{ width: candidate * 2, height: candidate * 2 }}
          />
        </button>
      ))}

      <span className="mx-1 h-6 w-px shrink-0 bg-[#9ED0FF]/15 md:mx-0 md:my-1 md:h-px md:w-6" />

      {STROKE_DASHES.map((candidate) => {
        // A label, a token and a marker wear no dash: the group goes quiet
        // rather than offering a choice the commit would throw away.
        const usable = editable && !GLYPH[tool];

        return (
          <button
            key={candidate}
            type="button"
            title={t(`dash_${candidate}`)}
            disabled={!usable}
            aria-pressed={candidate === dash}
            onClick={() => onDash(candidate)}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-lg transition md:size-10",
              candidate === dash
                ? "bg-[#9ED0FF]/20 text-[#CCE7FF]"
                : "text-[#9ED0FF]/60 hover:bg-[#9ED0FF]/10",
              !usable && "cursor-default opacity-30",
            )}
          >
            <span className="sr-only">{t(`dash_${candidate}`)}</span>
            <svg viewBox="0 0 24 4" className="w-5" aria-hidden="true">
              <line
                x1="1"
                y1="2"
                x2="23"
                y2="2"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={PREVIEW[candidate]}
              />
            </svg>
          </button>
        );
      })}
    </nav>
  );
}
