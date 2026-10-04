"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  setPlayerReputation,
  setPlayerReputationStandingAction,
} from "@/app/reps/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CAREER_FAMILIES,
  currentLevel,
  factionFamily,
  fold,
  isMaxed,
  isStarted,
  levelTone,
  matchesSearch,
  showsStanding,
  type CareerFamily,
} from "@/lib/reputations-view";
import type {
  Faction,
  FactionCareer,
  FactionLevel,
  PlayerReputations,
} from "@/types/reputations";

type View = "all" | "started" | "todo";

const PANEL =
  "rounded-2xl border border-[#9ED0FF]/15 bg-[#092840]/75 shadow-xl shadow-black/20";

const TONE_FILL = {
  below: "bg-[#F2B880]",
  default: "bg-[#9ED0FF]/45",
  progress: "bg-[#9ED0FF]",
  top: "bg-[#F5C46B]",
};

const TONE_TEXT = {
  below: "text-[#F7D2AE]",
  default: "text-white/60",
  progress: "text-[#CFE8FF]",
  top: "text-[#F7D68F]",
};

const formatRep = (value: number) => value.toLocaleString("fr-FR");

export function FactionsList({
  factions,
  playerReputation,
}: {
  factions: Faction[];
  playerReputation: PlayerReputations;
}) {
  const t = useTranslations("Reputations");
  const [reputations, setReputations] =
    useState<PlayerReputations>(playerReputation);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [family, setFamily] = useState<CareerFamily | "all">("all");
  const [openName, setOpenName] = useState<string | null>(null);

  // Une faction disparue du jeu ne reste que pour qui l'a suivie.
  const listed = useMemo(
    () =>
      factions.filter(
        (faction) =>
          !faction.removedInVersion || isStarted(faction, reputations),
      ),
    [factions, reputations],
  );

  const visible = useMemo(() => {
    const needle = fold(query.trim());
    return listed.filter(
      (faction) =>
        matchesSearch(faction, needle) &&
        (family === "all" || factionFamily(faction) === family) &&
        (view === "all" ||
          (view === "started") === isStarted(faction, reputations)),
    );
  }, [listed, query, family, view, reputations]);

  const groups = CAREER_FAMILIES.map((key) => ({
    key,
    factions: visible.filter((faction) => factionFamily(faction) === key),
  })).filter((group) => group.factions.length > 0);

  const presentFamilies = CAREER_FAMILIES.filter((key) =>
    listed.some((faction) => factionFamily(faction) === key),
  );

  const startedCount = listed.filter((faction) =>
    isStarted(faction, reputations),
  ).length;
  const maxedCount = listed.filter((faction) =>
    isMaxed(faction, reputations),
  ).length;

  // Enregistré tout de suite à l'écran ; un échec remet l'état précédent.
  async function save(next: PlayerReputations, request: () => Promise<void>) {
    const previous = reputations;
    setReputations(next);
    try {
      await request();
    } catch {
      setReputations(previous);
      toast.error(t("saveFailed"));
    }
  }

  function chooseLevel(
    faction: Faction,
    career: FactionCareer,
    level: FactionLevel,
  ) {
    const entry = reputations[faction.name];
    void save(
      {
        ...reputations,
        [faction.name]: {
          standing: entry?.standing ?? faction.defaultStanding,
          careers: { ...entry?.careers, [career.name]: { level } },
        },
      },
      () => setPlayerReputation(faction.name, career.name, level.name),
    );
  }

  function chooseStanding(faction: Faction, standing: string) {
    const entry = reputations[faction.name];
    void save(
      {
        ...reputations,
        [faction.name]: { careers: entry?.careers ?? {}, standing },
      },
      () => setPlayerReputationStandingAction(faction.name, standing),
    );
  }

  const openFaction = listed.find((faction) => faction.name === openName);

  return (
    <div className="flex flex-col gap-5">
      <dl className="flex gap-2.5">
        <div className={cn(PANEL, "min-w-32 rounded-xl px-4 py-3 shadow-none")}>
          <dt className="text-xs text-white/60">{t("trackedFactions")}</dt>
          <dd className="mt-0.5 font-mono text-xl font-bold">
            {startedCount}
            <span className="text-sm text-white/50"> / {listed.length}</span>
          </dd>
        </div>
        <div className={cn(PANEL, "min-w-32 rounded-xl px-4 py-3 shadow-none")}>
          <dt className="text-xs text-white/60">{t("maxedRanks")}</dt>
          <dd className="mt-0.5 font-mono text-xl font-bold text-[#F7D68F]">
            {maxedCount}
          </dd>
        </div>
      </dl>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B2E4A]/95 p-3 backdrop-blur-sm">
        <label className="flex h-10 min-w-0 flex-[1_1_260px] items-center gap-2 rounded-lg border border-[#9ED0FF]/20 bg-[#08243A] px-3">
          <Search aria-hidden className="size-4 shrink-0 text-white/55" />
          <span className="sr-only">{t("searchLabel")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/45"
          />
        </label>

        <div
          role="group"
          aria-label={t("viewLabel")}
          className="flex gap-0.5 rounded-lg border border-[#9ED0FF]/15 bg-[#08243A] p-0.5"
        >
          {(["all", "started", "todo"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs font-medium text-white/60 hover:text-white",
                view === option &&
                  "bg-[#9ED0FF] text-[#06233A] hover:text-[#06233A]",
              )}
            >
              {t(`view.${option}`)}
            </button>
          ))}
        </div>

        {presentFamilies.length > 1 && (
          <div
            role="group"
            aria-label={t("familyLabel")}
            className="flex flex-wrap gap-1.5"
          >
            {(["all", ...presentFamilies] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={family === option}
                onClick={() => setFamily(option)}
                className={cn(
                  "h-9 rounded-full border border-[#9ED0FF]/20 px-3.5 text-[13px] font-medium text-white/80 hover:border-[#9ED0FF]/45",
                  family === option &&
                    "border-[#9ED0FF] bg-[#9ED0FF]/10 text-[#9ED0FF]",
                )}
              >
                {t(`family.${option}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-[#9ED0FF]/25 p-10 text-center">
          <strong>{t("noMatchTitle")}</strong>
          <span className="text-sm text-white/70">{t("noMatchHint")}</span>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-3">
            <h2 className="mt-2 flex items-baseline gap-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-white/60">
              {t(`group.${group.key}`)}
              <span className="font-mono text-xs tracking-normal text-white/45">
                {group.factions.length}
              </span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3">
              {group.factions.map((faction) => (
                <FactionCard
                  key={faction.name}
                  faction={faction}
                  reputations={reputations}
                  onOpen={() => setOpenName(faction.name)}
                  onLevel={(career, level) =>
                    chooseLevel(faction, career, level)
                  }
                />
              ))}
            </div>
          </section>
        ))
      )}

      <Dialog
        open={!!openFaction}
        onOpenChange={(open) => !open && setOpenName(null)}
      >
        {openFaction && (
          <FactionDetail
            faction={openFaction}
            reputations={reputations}
            onLevel={(career, level) => chooseLevel(openFaction, career, level)}
            onStanding={(standing) => chooseStanding(openFaction, standing)}
          />
        )}
      </Dialog>
    </div>
  );
}

function factionMeta(
  faction: Faction,
  t: ReturnType<typeof useTranslations>,
): string {
  return [
    faction.focus,
    faction.lawful === undefined
      ? undefined
      : faction.lawful
        ? t("lawful")
        : t("unlawful"),
    faction.removedInVersion
      ? t("removed", { version: faction.removedInVersion })
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function FactionCard({
  faction,
  reputations,
  onOpen,
  onLevel,
}: {
  faction: Faction;
  reputations: PlayerReputations;
  onOpen: () => void;
  onLevel: (career: FactionCareer, level: FactionLevel) => void;
}) {
  const t = useTranslations("Reputations");
  const started = isStarted(faction, reputations);
  const maxed = isMaxed(faction, reputations);
  const meta = factionMeta(faction, t);
  const standing = reputations[faction.name]?.standing;

  return (
    <article
      className={cn(
        PANEL,
        "flex flex-col gap-3.5 rounded-xl p-4 shadow-none",
        started && "border-[#9ED0FF]/30",
        maxed && "border-[#F5C46B]/45",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={onOpen}
            className="text-left text-base font-semibold hover:text-[#CFE8FF] hover:underline"
          >
            {faction.name}
          </button>
          {meta && <span className="text-xs text-white/60">{meta}</span>}
        </div>
        {maxed ? (
          <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-[#F5C46B]/55 bg-[#F5C46B]/15 px-2 text-[11px] font-semibold text-[#F7D68F]">
            {t("maxBadge")}
          </span>
        ) : showsStanding(faction) &&
          standing &&
          standing !== faction.defaultStanding ? (
          <span className="shrink-0 text-xs text-white/60">{standing}</span>
        ) : null}
      </div>

      {faction.careers.length === 0 ? (
        <p className="text-xs text-white/60">{t("noCareer")}</p>
      ) : (
        faction.careers.map((career) => (
          <CareerLadder
            key={career.name}
            faction={faction}
            career={career}
            level={currentLevel(faction, career, reputations)}
            onLevel={(level) => onLevel(career, level)}
          />
        ))
      )}
    </article>
  );
}

function CareerLadder({
  faction,
  career,
  level,
  onLevel,
}: {
  faction: Faction;
  career: FactionCareer;
  level: FactionLevel | undefined;
  onLevel: (level: FactionLevel) => void;
}) {
  const t = useTranslations("Reputations");
  const tone = levelTone(career, level);
  const index = level
    ? career.levels.findIndex((option) => option.name === level.name)
    : -1;
  const defaultIndex = career.levels.findIndex((option) => option.isDefault);
  const next = index >= 0 ? career.levels[index + 1] : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] text-white/75">
          {career.name}
        </span>
        {/* Le nom du rang est le sélecteur : ce qu'on lit est ce qu'on change. */}
        <select
          aria-label={t("rankOf", {
            career: career.name,
            faction: faction.name,
          })}
          value={level?.name ?? ""}
          onChange={(event) => {
            const picked = career.levels.find(
              (option) => option.name === event.target.value,
            );
            if (picked) onLevel(picked);
          }}
          className={cn(
            "h-8 max-w-56 cursor-pointer rounded-md border border-transparent bg-transparent text-right text-[13px] font-semibold hover:border-[#9ED0FF]/30 focus:border-[#9ED0FF]/60 focus:outline-none [&>option]:bg-[#0B2E4A] [&>option]:text-white",
            TONE_TEXT[tone],
          )}
        >
          {career.levels.map((option) => (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <div
        role="group"
        aria-label={t("ladderOf", { career: career.name })}
        className="flex gap-0.5"
      >
        {career.levels.map((option, position) => {
          const filled =
            position <= index && (position >= defaultIndex || tone === "below");
          return (
            <button
              key={option.name}
              type="button"
              title={rankTitle(option)}
              aria-label={rankTitle(option)}
              aria-pressed={position === index}
              onClick={() => onLevel(option)}
              className="group flex h-7 flex-1 items-center"
            >
              <span
                className={cn(
                  "block h-2.5 w-full rounded-full bg-[#9ED0FF]/12 group-hover:outline group-hover:outline-2 group-hover:outline-offset-2 group-hover:outline-[#9ED0FF]/55 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[#9ED0FF]",
                  position === defaultIndex &&
                    "ring-1 ring-inset ring-[#9ED0FF]/35",
                  filled && TONE_FILL[tone],
                )}
              />
            </button>
          );
        })}
      </div>

      <span className="text-xs text-white/60">
        {next
          ? next.minReputation && next.minReputation >= 10
            ? t("nextRankWithRep", {
                rank: next.name,
                rep: formatRep(next.minReputation),
              })
            : t("nextRank", { rank: next.name })
          : t("topRank")}
      </span>
    </div>
  );
}

function rankTitle(level: FactionLevel): string {
  return level.minReputation && level.minReputation > 0
    ? `${level.name} · ${formatRep(level.minReputation)}`
    : level.name;
}

function FactionDetail({
  faction,
  reputations,
  onLevel,
  onStanding,
}: {
  faction: Faction;
  reputations: PlayerReputations;
  onLevel: (career: FactionCareer, level: FactionLevel) => void;
  onStanding: (standing: string) => void;
}) {
  const t = useTranslations("Reputations");
  const meta = [factionMeta(faction, t), faction.headquarters]
    .filter(Boolean)
    .join(" · ");
  const standing =
    reputations[faction.name]?.standing ?? faction.defaultStanding;

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto border-[#9ED0FF]/20 bg-[#0B2E4A] text-white sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="text-xl">{faction.name}</DialogTitle>
        {meta && (
          <DialogDescription className="text-white/65">
            {meta}
          </DialogDescription>
        )}
      </DialogHeader>

      {faction.description && (
        <p className="text-sm leading-relaxed text-white/80">
          {faction.description}
        </p>
      )}

      {showsStanding(faction) && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-white/80">
            {t("standing")}
          </legend>
          <div className="flex gap-1.5">
            {faction.standings.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={standing === option}
                onClick={() => onStanding(option)}
                className={cn(
                  "h-10 flex-1 rounded-lg border border-[#9ED0FF]/20 text-[13px] font-medium text-white/75",
                  standing === option &&
                    (option === "Hostile"
                      ? "border-[#F2B880] bg-[#F2B880]/10 text-[#F7D2AE]"
                      : "border-[#9ED0FF] bg-[#9ED0FF]/10 text-[#CFE8FF]"),
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {faction.careers.map((career) => {
        const level = currentLevel(faction, career, reputations);
        const index = level
          ? career.levels.findIndex((option) => option.name === level.name)
          : -1;
        const defaultIndex = career.levels.findIndex(
          (option) => option.isDefault,
        );
        const tone = levelTone(career, level);
        return (
          <fieldset key={career.name} className="flex flex-col gap-1">
            <legend className="mb-2 flex w-full justify-between text-[13px] font-semibold text-white/80">
              <span>{career.name}</span>
              <span className="font-medium text-white/50">
                {t("requiredRep")}
              </span>
            </legend>
            {[...career.levels].reverse().map((option) => {
              const position = career.levels.indexOf(option);
              const checked = position === index;
              const reached =
                position <= index &&
                (position >= defaultIndex || tone === "below");
              return (
                <label
                  key={option.name}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3.5 text-sm hover:bg-[#9ED0FF]/5 has-[:focus-visible]:border-[#9ED0FF]",
                    checked && "border-[#9ED0FF] bg-[#9ED0FF]/10 font-semibold",
                    checked && tone === "top" && "border-[#F5C46B]",
                  )}
                >
                  <input
                    type="radio"
                    name={`rank-${career.name}`}
                    checked={checked}
                    onChange={() => onLevel(career, option)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 shrink-0 rounded-full ring-2 ring-inset ring-[#9ED0FF]/30",
                      reached && cn(TONE_FILL[tone], "ring-0"),
                    )}
                  />
                  <span className="flex-1">
                    {option.name}
                    {option.isDefault && (
                      <span className="ml-2 text-xs font-normal text-white/50">
                        {t("startingRank")}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[13px] font-normal text-white/55">
                    {option.minReputation && option.minReputation > 0
                      ? formatRep(option.minReputation)
                      : "—"}
                  </span>
                </label>
              );
            })}
          </fieldset>
        );
      })}

      <p className="text-xs text-white/50">{t("savedHint")}</p>
    </DialogContent>
  );
}
