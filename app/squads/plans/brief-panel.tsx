"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Pencil, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  formatClock,
  PHASE_ABORT_MAX_LENGTH,
  PHASE_MAX_POINTS,
  PHASE_NAME_MAX_LENGTH,
  PHASE_OBJECTIVE_MAX_LENGTH,
  PHASE_POINT_MAX_LENGTH,
  phaseStartSec,
  type PlanPhase,
} from "@/types/plan";
import type { Squad } from "@/types/squad";
import { RoleIcon, roleOf } from "../role-icon";

/**
 * What the phase on screen asks of the squad, in words.
 *
 * Edited with an explicit save rather than on every keystroke, for the reason
 * the announcement is: on a phone the keyboard covers half the screen, and text
 * the whole raid reads deserves a «done».
 *
 * Whoever does not run the plan reads it. There is no third state — a briefing
 * everybody may rewrite is not a briefing.
 */
export function BriefPanel({
  phase,
  phases,
  squads,
  governs,
  busy,
  onSave,
  onDuration,
  className,
}: {
  phase: PlanPhase;
  phases: PlanPhase[];
  /** Every squad whose members can be given a task — the raid's, or the one. */
  squads: Squad[];
  governs: boolean;
  busy: boolean;
  onSave: (patch: {
    name?: string;
    objective?: string;
    points?: string[];
    abort?: string;
  }) => Promise<boolean>;
  onDuration: (seconds: number) => void;
  className?: string;
}) {
  const t = useTranslations("Plans");
  const [editing, setEditing] = useState(false);

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col gap-3 overflow-y-auto border-[#9ED0FF]/15 bg-[#0B3A5A] p-3",
        className,
      )}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[#CCE7FF]">
            {phase.name}
          </p>
          <p className="font-mono text-[11px] tracking-wider text-[#9ED0FF]/55">
            {formatClock(phaseStartSec(phases, phase.id))}
            {phase.durationSec > 0
              ? ` · ${t("minutes", { count: Math.round(phase.durationSec / 60) })}`
              : ""}
          </p>
        </div>

        {governs && !editing ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("editBrief")}
            onClick={() => setEditing(true)}
          >
            <span className="sr-only">{t("editBrief")}</span>
            <Pencil className="size-4" />
          </Button>
        ) : null}
      </header>

      {editing ? (
        <BriefEditor
          // A phase switched under the editor is a different brief, not an edit
          // of this one: remounting is what makes the fields follow, and it
          // needs no effect to keep them in step.
          key={phase.id}
          phase={phase}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => {
            const saved = await onSave(patch);
            if (saved) setEditing(false);
          }}
        />
      ) : (
        <>
          <section className="rounded-lg border-l-2 border-[#9ED0FF]/40 bg-[#9ED0FF]/[0.06] px-3 py-2">
            <p
              className={cn(
                "whitespace-pre-wrap text-[13px] leading-relaxed",
                phase.objective ? "text-[#CCE7FF]" : "text-[#9ED0FF]/45",
              )}
            >
              {phase.objective || t("noObjective")}
            </p>
          </section>

          {phase.points.length > 0 ? (
            <section>
              <Kicker>{t("points")}</Kicker>
              <ul className="flex flex-col gap-2">
                {phase.points.map((point, index) => (
                  <li
                    key={`${index}-${point}`}
                    className="flex gap-2 text-[13px] leading-snug text-[#9ED0FF]/90"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#9ED0FF]/70" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {phase.abort ? (
            <section>
              <Kicker>{t("abort")}</Kicker>
              <div className="flex gap-2 rounded-lg border-l-2 border-red-300/60 bg-red-300/[0.07] px-2.5 py-2">
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-red-300/85"
                  aria-hidden="true"
                />
                <p className="text-[13px] leading-snug text-red-200">
                  {phase.abort}
                </p>
              </div>
            </section>
          ) : null}

          {phase.assignments.length > 0 ? (
            <section>
              <Kicker>{t("assignments")}</Kicker>
              <ul className="flex flex-col">
                {phase.assignments.map((assignment) => {
                  const member = memberOf(squads, assignment.userId);
                  const squad = squadOf(squads, assignment.userId);

                  return (
                    <li
                      key={assignment.userId}
                      className="flex min-h-11 items-center gap-2 border-t border-[#9ED0FF]/10"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center text-[#9ED0FF]/70">
                        <RoleIcon
                          icon={
                            squad && member
                              ? (roleOf(squad, member.role)?.icon ?? undefined)
                              : undefined
                          }
                          className="size-4"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-[#CCE7FF]">
                          {member?.name ?? assignment.name}
                        </span>
                        <span className="block truncate text-[11px] text-[#9ED0FF]/65">
                          {assignment.task}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {governs ? (
            <section>
              <Kicker>{t("duration")}</Kicker>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={240}
                  aria-label={t("duration")}
                  value={Math.round(phase.durationSec / 60)}
                  onChange={(event) =>
                    onDuration(Math.max(0, Number(event.target.value) || 0) * 60)
                  }
                  className="h-9 w-20"
                />
                <span className="text-[13px] text-[#9ED0FF]/70">
                  {t("minutesUnit")}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-[#9ED0FF]/55">
                {t("durationHint")}
              </p>
            </section>
          ) : null}
        </>
      )}
    </aside>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[#9ED0FF]/50">
      {children}
    </p>
  );
}

/** The brief, edited whole: name, objective, the points fermes, the abort. */
function BriefEditor({
  phase,
  busy,
  onCancel,
  onSave,
}: {
  phase: PlanPhase;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: {
    name: string;
    objective: string;
    points: string[];
    abort: string;
  }) => void;
}) {
  const t = useTranslations("Plans");

  const [name, setName] = useState(phase.name);
  const [objective, setObjective] = useState(phase.objective);
  const [abort, setAbort] = useState(phase.abort);
  const [points, setPoints] = useState(phase.points.join("\n"));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();

        onSave({
          name: name.trim() || phase.name,
          objective: objective.trim(),
          abort: abort.trim(),
          points: points
            .split("\n")
            .map((point) => point.trim())
            .filter(Boolean)
            .slice(0, PHASE_MAX_POINTS)
            .map((point) => point.slice(0, PHASE_POINT_MAX_LENGTH)),
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <Kicker>{t("phaseName")}</Kicker>
        <Input
          value={name}
          maxLength={PHASE_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <Kicker>{t("objective")}</Kicker>
        <Textarea
          value={objective}
          rows={4}
          maxLength={PHASE_OBJECTIVE_MAX_LENGTH}
          onChange={(event) => setObjective(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <Kicker>{t("pointsOnePerLine", { max: PHASE_MAX_POINTS })}</Kicker>
        <Textarea
          value={points}
          rows={4}
          onChange={(event) => setPoints(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <Kicker>{t("abort")}</Kicker>
        <Textarea
          value={abort}
          rows={3}
          maxLength={PHASE_ABORT_MAX_LENGTH}
          onChange={(event) => setAbort(event.target.value)}
        />
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

function memberOf(squads: Squad[], userId: string) {
  for (const squad of squads) {
    const member = squad.members.find((one) => one.userId === userId);
    if (member) return member;
  }

  return null;
}

function squadOf(squads: Squad[], userId: string) {
  return (
    squads.find((squad) =>
      squad.members.some((member) => member.userId === userId),
    ) ?? null
  );
}
