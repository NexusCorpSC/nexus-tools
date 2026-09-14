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
  Square,
  Type,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { STROKE_WIDTHS, type PlanInk } from "@/types/plan";
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

export function Toolbar({
  tool,
  ink,
  width,
  hues,
  mySquadId,
  editable,
  onTool,
  onInk,
  onWidth,
  className,
}: {
  tool: Tool;
  ink: PlanInk;
  width: number;
  hues: Map<string, string>;
  mySquadId: string;
  editable: boolean;
  onTool: (tool: Tool) => void;
  onInk: (ink: PlanInk) => void;
  onWidth: (width: number) => void;
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
    </nav>
  );
}
