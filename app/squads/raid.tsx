"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Crown, Skull } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RaidView, Squad } from "@/types/squad";
import {
  commandsSquad,
  inJoinOrder,
  MemberList,
  tally,
  type MemberActions,
} from "./members";

/**
 * A hue per sub-squad, so a dot is enough to tell them apart. Blues through
 * pinks only: green, amber and red already mean ready, leader and down on the
 * rows underneath.
 */
const SQUAD_HUES = [250, 300, 340, 200, 275, 320];

/** How many dots a folded squad draws before it gives up and counts. */
const PIPS_SHOWN = 12;

/**
 * Every squad of the raid, each foldable — one column on a phone, two on
 * anything wider.
 *
 * Folded, a squad is one line and a row of dots, one per member: fifteen
 * players do not fit on a phone screen, and fifteen dots do. Only the squads
 * the reader is in are interactive; the others say so by not offering.
 */
export function RaidBoard({
  raid,
  userId,
  actionsFor,
}: {
  raid: RaidView;
  userId: string;
  /** The row actions for one squad of the raid the reader is a member of. */
  actionsFor: (squad: Squad) => MemberActions;
}) {
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {raid.squads.map((squad, index) => {
        const mine = squad.members.some((member) => member.userId === userId);
        const open = !folded[squad.id];

        return (
          <section
            key={squad.id}
            className="rounded-xl border border-[#9ED0FF]/15 bg-[#061E30]/40 px-3 py-2"
          >
            <SubSquadHeader
              squad={squad}
              hue={SQUAD_HUES[index % SQUAD_HUES.length]}
              open={open}
              mine={mine}
              isLead={raid.leadSquadId === squad.id}
              onToggle={() =>
                setFolded((previous) => ({
                  ...previous,
                  [squad.id]: !previous[squad.id],
                }))
              }
            />

            {open && squad.announcements ? (
              <p className="mt-1 whitespace-pre-wrap pl-7 text-xs text-[#9ED0FF]/65">
                {squad.announcements}
              </p>
            ) : null}

            {open ? (
              <MemberList
                squad={squad}
                userId={mine ? userId : null}
                commands={mine && commandsSquad(squad, userId)}
                actions={actionsFor(squad)}
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function SubSquadHeader({
  squad,
  hue,
  open,
  mine,
  isLead,
  onToggle,
}: {
  squad: Squad;
  hue: number;
  open: boolean;
  mine: boolean;
  isLead: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("Squads");
  const counts = tally([squad]);
  const toggleLabel = open
    ? t("fold", { name: squad.name })
    : t("unfold", { name: squad.name });

  return (
    <div className="flex min-h-10 items-center gap-2">
      <button
        type="button"
        title={toggleLabel}
        onClick={onToggle}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#9ED0FF]/70 transition hover:bg-[#9ED0FF]/10 hover:text-[#CCE7FF]"
      >
        <span className="sr-only">{toggleLabel}</span>
        {open ? (
          <ChevronDown className="size-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4" aria-hidden="true" />
        )}
      </button>

      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: `oklch(0.74 0.13 ${hue})` }}
        aria-hidden="true"
      />

      <span
        className={cn(
          "min-w-0 truncate text-sm font-semibold",
          mine ? "text-[#CCE7FF]" : "text-[#9ED0FF]",
        )}
      >
        {squad.name}
      </span>

      {isLead ? (
        <span title={t("leadSquad")}>
          <Crown className="size-4 shrink-0 text-amber-300" aria-hidden="true" />
          <span className="sr-only">{t("leadSquad")}</span>
        </span>
      ) : null}

      {!open ? (
        <span className="flex shrink-0 items-center gap-1">
          {inJoinOrder(squad.members)
            .slice(0, PIPS_SHOWN)
            .map((member) => (
              <span
                key={member.userId}
                title={`${member.name} — ${
                  !member.alive
                    ? t("down")
                    : member.ready
                      ? t("ready")
                      : t("notReady")
                }`}
                className={cn(
                  "size-2 rounded-full",
                  !member.alive
                    ? "bg-red-300"
                    : member.ready
                      ? "bg-emerald-300"
                      : "bg-[#9ED0FF]/35",
                )}
              />
            ))}

          {squad.members.length > PIPS_SHOWN ? (
            <span className="text-xs text-[#9ED0FF]/50">
              +{squad.members.length - PIPS_SHOWN}
            </span>
          ) : null}
        </span>
      ) : null}

      <span className="flex-1" />

      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          counts.ready === counts.total
            ? "text-emerald-300"
            : "text-[#9ED0FF]/80",
        )}
      >
        {counts.ready}/{counts.total}
      </span>

      {counts.down ? (
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-red-300">
          <Skull className="size-3.5" aria-hidden="true" />
          {counts.down}
        </span>
      ) : null}
    </div>
  );
}
