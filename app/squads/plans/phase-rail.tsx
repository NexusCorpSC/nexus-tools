"use client";

import { useTranslations } from "next-intl";
import { Copy, Eraser, Layers, Lock, Plus, Trash2, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatClock,
  inPlanOrder,
  PLAN_MAX_PHASES,
  phaseStartSec,
  type PlanPhase,
} from "@/types/plan";
import { ConfirmButton } from "../widgets";

/**
 * The steps of the plan, and the one control that is used most.
 *
 * Each card carries the phase's own T+, which is the sum of the durations
 * before it — correct one step and every later time moves with it, which is the
 * point of storing a duration rather than a time.
 *
 * The «+» copies the last phase rather than starting a blank one: a plan is
 * built by drawing the next step on top of the one before, and a briefing where
 * the station has to be redrawn four times is not one anybody finishes.
 */
export function PhaseRail({
  phases,
  currentId,
  ghosting,
  governs,
  busy,
  onPick,
  onAdd,
  onToggleGhost,
  onLock,
  onDelete,
  onClear,
  className,
}: {
  phases: PlanPhase[];
  currentId: string;
  ghosting: boolean;
  governs: boolean;
  busy: boolean;
  onPick: (phaseId: string) => void;
  onAdd: (after: string | null) => void;
  onToggleGhost: () => void;
  onLock: (phaseId: string, locked: boolean) => void;
  onDelete: (phaseId: string) => void;
  onClear: (phaseId: string) => void;
  className?: string;
}) {
  const t = useTranslations("Plans");
  const ordered = inPlanOrder(phases);
  const current = ordered.find((phase) => phase.id === currentId);

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-[#9ED0FF]/15 bg-[#0B3A5A] px-3 py-2",
        className,
      )}
    >
      <div className="hidden w-32 shrink-0 lg:block">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#9ED0FF]/50">
          {t("phases")}
        </p>
        <p className="mt-0.5 text-[13px] text-[#9ED0FF]/85">
          {t("phaseCount", { count: ordered.length })}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {ordered.map((phase, index) => {
          const active = phase.id === currentId;

          return (
            <button
              key={phase.id}
              type="button"
              onClick={() => onPick(phase.id)}
              className={cn(
                "flex h-14 shrink-0 items-center gap-2.5 rounded-lg border px-3 text-left transition",
                active
                  ? "border-[#9ED0FF]/45 bg-[#9ED0FF]/12"
                  : "border-[#9ED0FF]/15 bg-[#061E30]/45 hover:bg-[#061E30]/70",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-xs",
                  active
                    ? "bg-[#9ED0FF]/20 text-[#CCE7FF]"
                    : "bg-[#9ED0FF]/10 text-[#9ED0FF]/70",
                )}
              >
                {index + 1}
              </span>

              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "flex items-center gap-1.5 truncate text-[13px] font-semibold",
                    active ? "text-[#CCE7FF]" : "text-[#9ED0FF]",
                  )}
                >
                  {phase.name}
                  {phase.locked ? (
                    <Lock
                      className="size-3 shrink-0 text-amber-300"
                      aria-label={t("frozen")}
                    />
                  ) : null}
                </span>
                <span className="font-mono text-[10px] text-[#9ED0FF]/55">
                  {formatClock(phaseStartSec(ordered, phase.id))}
                </span>
              </span>
            </button>
          );
        })}

        {governs && ordered.length < PLAN_MAX_PHASES ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdd(ordered.at(-1)?.id ?? null)}
            title={t("addPhaseHint")}
            className="flex h-14 w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-[#9ED0FF]/28 text-[11px] text-[#9ED0FF]/60 transition hover:border-[#9ED0FF]/45 hover:text-[#CCE7FF]"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("addPhase")}
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-pressed={ghosting}
          onClick={onToggleGhost}
          className={cn(
            "border-[#9ED0FF]/25",
            ghosting && "border-[#9ED0FF]/45 bg-[#9ED0FF]/14 text-[#CCE7FF]",
          )}
        >
          <Layers />
          <span className="hidden sm:inline">{t("ghost")}</span>
        </Button>

        {governs && current ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm">
                <span className="hidden sm:inline">{t("phaseActions")}</span>
                <span className="sm:hidden">…</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-1">
              <MenuItem
                icon={current.locked ? <Unlock className="size-4" /> : <Lock className="size-4 text-amber-300" />}
                onClick={() => onLock(current.id, !current.locked)}
              >
                {current.locked ? t("unfreeze") : t("freeze")}
              </MenuItem>

              <MenuItem
                icon={<Copy className="size-4 text-[#9ED0FF]/70" />}
                onClick={() => onAdd(current.id)}
              >
                {t("duplicatePhase")}
              </MenuItem>

              <div className="my-1 h-px bg-[#9ED0FF]/15" />

              <ConfirmButton
                variant="ghost"
                size="sm"
                className="h-auto min-h-10 w-full justify-start gap-2 px-2 font-normal text-red-300 hover:bg-red-500/15 hover:text-red-200"
                confirmLabel={t("confirmClear")}
                onConfirm={() => onClear(current.id)}
              >
                <Eraser />
                {t("clearPhase")}
              </ConfirmButton>

              {phases.length > 1 ? (
                <ConfirmButton
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-10 w-full justify-start gap-2 px-2 font-normal text-red-300 hover:bg-red-500/15 hover:text-red-200"
                  confirmLabel={t("confirmDeletePhase")}
                  onConfirm={() => onDelete(current.id)}
                >
                  <Trash2 />
                  {t("deletePhase")}
                </ConfirmButton>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[#CCE7FF] transition hover:bg-[#9ED0FF]/10"
    >
      {icon}
      {children}
    </button>
  );
}
