"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { upload } from "@vercel/blob/client";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlacePicker } from "@/app/lieux/place-picker";
import { useItemSearch } from "@/app/items/use-item-search";
import {
  ContributionMetaFields,
  useContribute,
  type ContributionMetaValue,
} from "@/app/contributions/contribute-kit";
import type { ItemSummary } from "@/types/items";
import {
  MAX_TIMELINE_DESCRIPTION_LENGTH,
  MAX_TIMELINE_MISSIONS,
  MAX_TIMELINE_NAME_LENGTH,
  MAX_TIMELINE_PATCH_LENGTH,
  MAX_TIMELINE_RELATED,
  MAX_TIMELINE_REWARDS_PER_TIER,
  MAX_TIMELINE_SHORT_TEXT,
  MAX_TIMELINE_SOURCES,
  MAX_TIMELINE_SUMMARY_LENGTH,
  MAX_TIMELINE_TIERS,
  MAX_TIMELINE_TRACKS,
  TIMELINE_ACCESS,
  TIMELINE_EVENT_TYPES,
  TIMELINE_SOURCE_KINDS,
  TIMELINE_SYSTEMS,
  type TimelineAccess,
  type TimelineBanner,
  type TimelineEventInput,
  type TimelineEventType,
  type TimelineSourceKind,
  type TimelineSystem,
} from "@/types/timeline-events";

// ─── État du formulaire ─────────────────────────────────────────────────────

let sequence = 0;
/** Une clé de liste stable, pour qu'une ligne retirée n'emporte pas la suivante. */
const nextKey = () => `row-${++sequence}`;

type SourceRow = { key: string; kind: TimelineSourceKind; title: string; url: string };
type RewardRow = { key: string; itemSlug?: string; name: string; note: string };
type TierRow = { key: string; points: string; rewards: RewardRow[] };
type TrackRow = { key: string; id?: string; name: string; tiers: TierRow[] };
type MissionRow = {
  key: string;
  missionId?: string;
  missionTitle?: string;
  name: string;
  track: string;
  points: string;
  auec: string;
  conditions: string;
};

/** Une date ISO en UTC, telle qu'un `datetime-local` la montre (en UTC). */
function toLocalInput(iso?: string): string {
  return iso ? iso.slice(0, 16) : "";
}

/** Une date inchangée garde sa valeur d'origine, secondes comprises. */
function fromLocalInput(value: string, original?: string): string | undefined {
  if (!value) return undefined;
  return original && toLocalInput(original) === value ? original : `${value}:00.000Z`;
}

function numberOrUndefined(value: string): number | undefined {
  const number = Number(value.replace(/[\s ]/g, ""));
  return value.trim() === "" || !Number.isFinite(number) ? undefined : number;
}

const inputClass =
  "h-9 rounded-md border border-[#9ED0FF]/25 bg-[#071E30] px-2.5 text-sm text-[#E3F1FF]";

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 space-y-4 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
    >
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-base font-semibold">
          {title}
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-nexus"
    >
      <XMarkIcon className="size-4" />
    </button>
  );
}

// ─── Choisir une récompense dans le catalogue ───────────────────────────────

/**
 * Une récompense : on tape son nom, le catalogue propose les objets qui ont
 * une fiche (avec leur image) ; sans fiche, le nom saisi reste tel quel.
 */
function RewardField({
  reward,
  item,
  onChange,
  onPickItem,
  onRemove,
}: {
  reward: RewardRow;
  item?: ItemSummary;
  onChange: (reward: RewardRow) => void;
  onPickItem: (item: ItemSummary) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Timeline.Form");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { results, isLoading } = useItemSearch({
    query: reward.name,
    enabled: open && !reward.itemSlug && reward.name.trim().length >= 2,
    limit: 6,
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-2">
      {reward.itemSlug ? (
        <span className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[#7FF0D0]/30 bg-[#7FF0D0]/5 py-1 pl-1 pr-2">
          <span className="relative size-8 shrink-0 overflow-hidden rounded border border-[#9ED0FF]/25 bg-[#0b2238]">
            {item?.imageUrl && (
              <Image src={item.imageUrl} alt="" fill sizes="32px" className="object-cover" />
            )}
          </span>
          <span className="min-w-0 truncate text-sm text-[#E3F1FF]">
            {item?.name ?? reward.itemSlug}
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...reward, itemSlug: undefined, name: item?.name ?? "" })}
            className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-nexus"
          >
            {t("unlinkItem")}
          </button>
        </span>
      ) : (
        <div className="relative min-w-0 flex-1">
          <input
            aria-label={t("rewardName")}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open && results.length > 0}
            role="combobox"
            value={reward.name}
            placeholder={t("rewardPlaceholder")}
            maxLength={MAX_TIMELINE_NAME_LENGTH}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setOpen(true);
              onChange({ ...reward, name: event.target.value });
            }}
            className={`${inputClass} w-full`}
          />
          {open && reward.name.trim().length >= 2 && (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-[#9ED0FF]/25 bg-[#071E30] p-1 shadow-xl"
            >
              {results.map((result) => (
                <li key={result.slug} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => {
                      onPickItem(result);
                      onChange({ ...reward, itemSlug: result.slug, name: "" });
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded p-1.5 text-left text-sm hover:bg-[#9ED0FF]/10"
                  >
                    <span className="relative size-8 shrink-0 overflow-hidden rounded border border-[#9ED0FF]/25 bg-[#0b2238]">
                      {result.imageUrl && (
                        <Image src={result.imageUrl} alt="" fill sizes="32px" className="object-cover" />
                      )}
                    </span>
                    <span className="truncate">{result.name}</span>
                  </button>
                </li>
              ))}
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                {isLoading ? t("searching") : t("keepFreeText")}
              </li>
            </ul>
          )}
        </div>
      )}
      <input
        aria-label={t("rewardNote")}
        value={reward.note}
        placeholder={t("rewardNotePlaceholder")}
        maxLength={60}
        onChange={(event) => onChange({ ...reward, note: event.target.value })}
        className={`${inputClass} w-36`}
      />
      <RemoveButton label={t("removeReward")} onClick={onRemove} />
    </div>
  );
}

// ─── Choisir un contrat parmi les fiches missions ───────────────────────────

type MissionHit = { _id: string; title: string };

function useMissionSearch(query: string, enabled: boolean): MissionHit[] {
  const [served, setServed] = useState<{ query: string; missions: MissionHit[] }>({
    query: "",
    missions: [],
  });
  const trimmed = query.trim();

  useEffect(() => {
    if (!enabled || trimmed.length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      fetch(`/api/missions?${new URLSearchParams({ query: trimmed, limit: "6" })}`)
        .then((response) => response.json())
        .then((data: { missions?: MissionHit[] }) => {
          if (current) setServed({ query: trimmed, missions: data.missions ?? [] });
        })
        .catch(() => {
          if (current) setServed({ query: trimmed, missions: [] });
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trimmed, enabled]);

  return served.query === trimmed ? served.missions : [];
}

function MissionField({
  mission,
  trackNames,
  onChange,
  onRemove,
}: {
  mission: MissionRow;
  trackNames: string[];
  onChange: (mission: MissionRow) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Timeline.Form");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const results = useMissionSearch(mission.name, open && !mission.missionId);

  return (
    <li className="space-y-2 rounded-lg border border-[#9ED0FF]/14 bg-[#030912]/25 p-3">
      <div className="flex items-center gap-2">
        {mission.missionId ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[#7FF0D0]/30 bg-[#7FF0D0]/5 px-2.5 py-1.5 text-sm">
            <span className="truncate">{mission.missionTitle ?? mission.missionId}</span>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...mission,
                  missionId: undefined,
                  name: mission.missionTitle ?? "",
                })
              }
              className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-nexus"
            >
              {t("unlinkMission")}
            </button>
          </span>
        ) : (
          <div className="relative min-w-0 flex-1" onBlur={() => setTimeout(() => setOpen(false), 150)}>
            <input
              aria-label={t("missionName")}
              role="combobox"
              aria-controls={listId}
              aria-expanded={open && results.length > 0}
              value={mission.name}
              placeholder={t("missionPlaceholder")}
              maxLength={MAX_TIMELINE_NAME_LENGTH}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setOpen(true);
                onChange({ ...mission, name: event.target.value });
              }}
              className={`${inputClass} w-full`}
            />
            {open && results.length > 0 && (
              <ul
                id={listId}
                role="listbox"
                className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-[#9ED0FF]/25 bg-[#071E30] p-1 shadow-xl"
              >
                {results.map((result) => (
                  <li key={result._id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onChange({
                          ...mission,
                          missionId: result._id,
                          missionTitle: result.title,
                          name: "",
                        });
                        setOpen(false);
                      }}
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[#9ED0FF]/10"
                    >
                      {result.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <RemoveButton label={t("removeMission")} onClick={onRemove} />
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_110px_130px]">
        <select
          aria-label={t("missionTrack")}
          value={mission.track}
          onChange={(event) => onChange({ ...mission, track: event.target.value })}
          className={inputClass}
        >
          <option value="">{t("noTrack")}</option>
          {trackNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label={t("missionPoints")}
          inputMode="numeric"
          placeholder={t("missionPoints")}
          value={mission.points}
          onChange={(event) => onChange({ ...mission, points: event.target.value })}
          className={inputClass}
        />
        <input
          aria-label={t("missionAuec")}
          inputMode="numeric"
          placeholder={t("missionAuec")}
          value={mission.auec}
          onChange={(event) => onChange({ ...mission, auec: event.target.value })}
          className={inputClass}
        />
      </div>
      <input
        aria-label={t("missionConditions")}
        placeholder={t("missionConditions")}
        value={mission.conditions}
        maxLength={MAX_TIMELINE_SHORT_TEXT}
        onChange={(event) => onChange({ ...mission, conditions: event.target.value })}
        className={`${inputClass} w-full`}
      />
    </li>
  );
}

// ─── Le formulaire ──────────────────────────────────────────────────────────

export type EventFormOption = { slug: string; name: string };

/**
 * Proposer un évènement officiel, ou corriger sa fiche : ce que l'annonce de
 * CIG dit, avec au moins une source officielle. Le guide s'écrit à part, une
 * section à la fois.
 */
export function EventForm({
  mode,
  initial,
  initialPlace,
  initialItems,
  initialMissionTitles,
  eventOptions,
  canRename,
  contributionId,
  source,
  gameVersion,
}: {
  mode: "create" | "edit";
  initial?: Partial<TimelineEventInput>;
  initialPlace?: EventFormOption;
  initialItems: Record<string, ItemSummary>;
  initialMissionTitles: Record<string, string>;
  /** Les autres évènements, pour « Évènements liés ». */
  eventOptions: EventFormOption[];
  /** En correction, seul un contributeur de niveau 4 renomme. */
  canRename: boolean;
  contributionId?: string;
  source?: string;
  gameVersion?: string;
}) {
  const t = useTranslations("Timeline.Form");
  const tTypes = useTranslations("Timeline.types");
  const tSystems = useTranslations("Timeline.systems");
  const tAccess = useTranslations("Timeline.Event.accessValues");
  const tSources = useTranslations("Timeline.sources");
  const tForm = useTranslations("Contributions.Form");
  const router = useRouter();
  const { contribute, errorMessage } = useContribute();

  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<TimelineEventType>(initial?.type ?? "ingame");
  const [systems, setSystems] = useState<TimelineSystem[]>(initial?.systems ?? []);
  const [place, setPlace] = useState<EventFormOption | undefined>(initialPlace);
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [startAt, setStartAt] = useState(toLocalInput(initial?.startAt));
  const [endAt, setEndAt] = useState(toLocalInput(initial?.endAt));
  const [endTimeUnknown, setEndTimeUnknown] = useState(initial?.endTimeUnknown ?? false);
  const [patch, setPatch] = useState(initial?.patch ?? "");
  const [banner, setBanner] = useState<TimelineBanner | undefined>(initial?.banner);
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [access, setAccess] = useState<TimelineAccess>(initial?.access ?? "owners");
  const [permanentRewards, setPermanentRewards] = useState(
    initial?.permanentRewards ?? true,
  );
  const [sources, setSources] = useState<SourceRow[]>(() =>
    (initial?.sources?.length
      ? initial.sources
      : [{ kind: "commlink" as const, title: "", url: "" }]
    ).map((entry) => ({ ...entry, key: nextKey() })),
  );
  const [tracks, setTracks] = useState<TrackRow[]>(() =>
    (initial?.tracks ?? []).map((track) => ({
      key: nextKey(),
      id: track.id,
      name: track.name,
      tiers: track.tiers.map((tier) => ({
        key: nextKey(),
        points: String(tier.points),
        rewards: tier.rewards.map((reward) => ({
          key: nextKey(),
          itemSlug: reward.itemSlug,
          name: reward.name ?? "",
          note: reward.note ?? "",
        })),
      })),
    })),
  );
  const [items, setItems] = useState(initialItems);
  const [missions, setMissions] = useState<MissionRow[]>(() =>
    (initial?.missions ?? []).map((mission) => ({
      key: nextKey(),
      missionId: mission.missionId,
      missionTitle: mission.missionId
        ? initialMissionTitles[mission.missionId]
        : undefined,
      name: mission.name ?? "",
      track: mission.track ?? "",
      points: mission.points !== undefined ? String(mission.points) : "",
      auec: mission.auec !== undefined ? String(mission.auec) : "",
      conditions: mission.conditions ?? "",
    })),
  );
  const [related, setRelated] = useState<string[]>(initial?.relatedSlugs ?? []);
  const [meta, setMeta] = useState<ContributionMetaValue>({
    source: source ?? "",
    gameVersion: gameVersion ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const updateTrack = (key: string, change: (track: TrackRow) => TrackRow) =>
    setTracks((current) =>
      current.map((track) => (track.key === key ? change(track) : track)),
    );
  const updateTier = (
    trackKey: string,
    tierKey: string,
    change: (tier: TierRow) => TierRow,
  ) =>
    updateTrack(trackKey, (track) => ({
      ...track,
      tiers: track.tiers.map((tier) => (tier.key === tierKey ? change(tier) : tier)),
    }));

  const uploadBanner = async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    if (!/^(jpe?g|png|webp)$/.test(extension)) {
      setBannerError(t("bannerFormat"));
      return;
    }
    setUploading(true);
    setBannerError(null);
    try {
      const size = await new Promise<{ width: number; height: number }>(
        (resolve) => {
          const image = new window.Image();
          const url = URL.createObjectURL(file);
          image.onload = () => {
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
            URL.revokeObjectURL(url);
          };
          image.onerror = () => {
            resolve({ width: 0, height: 0 });
            URL.revokeObjectURL(url);
          };
          image.src = url;
        },
      );
      const base =
        (initial?.slug ?? name)
          .normalize("NFD")
          .replace(/[^A-Za-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase()
          .slice(0, 50) || "banniere";
      const blob = await upload(`timeline/${base}.${extension}`, file, {
        access: "public",
        handleUploadUrl: "/api/timeline-events/upload",
      });
      setBanner({
        url: blob.url,
        ...(size.width ? { width: size.width, height: size.height } : {}),
        credit: banner?.credit,
      });
    } catch (uploadError) {
      setBannerError((uploadError as Error).message || t("bannerFailed"));
    } finally {
      setUploading(false);
    }
  };

  const toInput = () => ({
    ...(mode === "create" || canRename ? { name } : {}),
    type,
    systems,
    placeSlug: place?.slug ?? "",
    summary,
    description,
    access,
    permanentRewards,
    startAt: fromLocalInput(startAt, initial?.startAt),
    endAt: fromLocalInput(endAt, initial?.endAt),
    endTimeUnknown: endAt ? endTimeUnknown : false,
    patch,
    relatedSlugs: related,
    banner,
    sources: sources.map(({ kind, title, url }) => ({ kind, title, url })),
    tracks: tracks.map((track) => ({
      ...(track.id ? { id: track.id } : {}),
      name: track.name,
      tiers: track.tiers.map((tier) => ({
        points: numberOrUndefined(tier.points) ?? 0,
        rewards: tier.rewards.map((reward) =>
          reward.itemSlug
            ? { itemSlug: reward.itemSlug, note: reward.note }
            : { name: reward.name, note: reward.note },
        ),
      })),
    })),
    missions: missions.map((mission) => ({
      ...(mission.missionId ? { missionId: mission.missionId } : { name: mission.name }),
      track: mission.track,
      points: numberOrUndefined(mission.points),
      auec: numberOrUndefined(mission.auec),
      conditions: mission.conditions,
    })),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = toInput();
      const result = await contribute(
        mode === "create"
          ? { kind: "timelineCreate", input }
          : { kind: "timelineEdit", slug: initial?.slug ?? "", input },
        { ...meta, contributionId },
      );
      if (!result.ok) {
        setError(errorMessage(result));
        return;
      }
      const slug = result.contribution.target.slug;
      router.push(
        result.contribution.status === "published" ? `/timeline/${slug}` : "/timeline",
      );
      router.refresh();
    });
  };

  const trackNames = tracks.map((track) => track.name.trim()).filter(Boolean);

  return (
    <form onSubmit={submit} className="space-y-5">
      <Section id="infos" title={t("infos")}>
        <div className="space-y-1.5">
          <Label htmlFor="event-name">{t("name")}</Label>
          <Input
            id="event-name"
            required
            maxLength={MAX_TIMELINE_NAME_LENGTH}
            value={name}
            disabled={mode === "edit" && !canRename}
            placeholder="RSI Discovery Month"
            onChange={(event) => setName(event.target.value)}
          />
          {mode === "edit" && !canRename && (
            <p className="text-xs text-muted-foreground">{t("renameLevel")}</p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="event-type">{t("type")}</Label>
            <select
              id="event-type"
              value={type}
              onChange={(event) => setType(event.target.value as TimelineEventType)}
              className={`${inputClass} w-full`}
            >
              {TIMELINE_EVENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {tTypes(value)}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("systems")}</legend>
            <div className="flex flex-wrap gap-3 pt-1.5">
              {TIMELINE_SYSTEMS.map((system) => (
                <label key={system} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={systems.includes(system)}
                    onChange={(event) =>
                      setSystems((current) =>
                        event.target.checked
                          ? [...current, system]
                          : current.filter((entry) => entry !== system),
                      )
                    }
                  />
                  {tSystems(system)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="space-y-1.5">
          <Label>{t("place")}</Label>
          <PlacePicker
            value={place?.slug}
            valueLabel={place?.name}
            placeholder={t("placePlaceholder")}
            onChange={(picked) =>
              setPlace(picked ? { slug: picked.slug, name: picked.name } : undefined)
            }
          />
          <p className="text-xs text-muted-foreground">{t("placeHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="event-summary">{t("summary")}</Label>
          <Input
            id="event-summary"
            required
            maxLength={MAX_TIMELINE_SUMMARY_LENGTH}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("summaryHint", { count: summary.length, max: MAX_TIMELINE_SUMMARY_LENGTH })}
          </p>
        </div>
      </Section>

      <Section id="dates" title={t("dates")} hint={t("datesHint")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="event-start">{t("start")}</Label>
            <input
              id="event-start"
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-end">{t("end")}</Label>
            <input
              id="event-end"
              type="datetime-local"
              value={endAt}
              min={startAt || undefined}
              disabled={!startAt}
              onChange={(event) => setEndAt(event.target.value)}
              className={`${inputClass} w-full disabled:opacity-50`}
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={endTimeUnknown}
                disabled={!endAt}
                onChange={(event) => setEndTimeUnknown(event.target.checked)}
              />
              {t("endTimeUnknown")}
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-patch">{t("patch")}</Label>
            <Input
              id="event-patch"
              maxLength={MAX_TIMELINE_PATCH_LENGTH}
              placeholder="4.3.2"
              value={patch}
              onChange={(event) => setPatch(event.target.value)}
            />
          </div>
        </div>
      </Section>

      <Section id="banner" title={t("banner")} hint={t("bannerHint")}>
        {banner && (
          <div className="relative aspect-[16/5] overflow-hidden rounded-lg border border-[#9ED0FF]/20">
            <Image src={banner.url} alt="" fill unoptimized className="object-cover" />
            <button
              type="button"
              onClick={() => setBanner(undefined)}
              className="absolute right-2 top-2 rounded-md bg-[#030912]/70 px-2 py-1 text-xs"
            >
              {t("bannerRemove")}
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-[#9ED0FF]/28 bg-[#0B3A5A]/60 px-3 text-sm font-semibold text-[#CCE7FF]">
            {uploading ? t("bannerUploading") : t("bannerUpload")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadBanner(file);
                event.target.value = "";
              }}
            />
          </label>
          <span className="text-xs text-muted-foreground">{t("or")}</span>
          <input
            aria-label={t("bannerUrl")}
            placeholder="https://media.robertsspaceindustries.com/…"
            value={bannerUrl}
            onChange={(event) => setBannerUrl(event.target.value)}
            className={`${inputClass} min-w-0 flex-1`}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!bannerUrl.startsWith("https://media.robertsspaceindustries.com/")}
            onClick={() => {
              setBanner({ url: bannerUrl.trim(), credit: banner?.credit });
              setBannerUrl("");
            }}
          >
            {t("bannerUse")}
          </Button>
        </div>
        {bannerError && <p className="text-sm text-red-400">{bannerError}</p>}
        {banner && (
          <div className="space-y-1.5">
            <Label htmlFor="event-credit">{t("bannerCredit")}</Label>
            <Input
              id="event-credit"
              maxLength={MAX_TIMELINE_SHORT_TEXT}
              value={banner.credit ?? ""}
              placeholder="© Cloud Imperium Games"
              onChange={(event) => setBanner({ ...banner, credit: event.target.value })}
            />
          </div>
        )}
      </Section>

      <Section id="presentation" title={t("presentation")}>
        <div className="space-y-1.5">
          <Label htmlFor="event-description">{t("description")}</Label>
          <Textarea
            id="event-description"
            rows={8}
            maxLength={MAX_TIMELINE_DESCRIPTION_LENGTH}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="font-mono text-[13px]"
          />
          <p className="text-xs text-muted-foreground">{t("descriptionHint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="event-access">{t("access")}</Label>
            <select
              id="event-access"
              value={access}
              onChange={(event) => setAccess(event.target.value as TimelineAccess)}
              className={`${inputClass} w-full`}
            >
              {TIMELINE_ACCESS.map((value) => (
                <option key={value} value={value}>
                  {tAccess(value)}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              checked={permanentRewards}
              onChange={(event) => setPermanentRewards(event.target.checked)}
            />
            {t("permanentRewards")}
          </label>
        </div>
      </Section>

      <Section id="sources" title={t("sources")} hint={t("sourcesHint")}>
        <ul className="space-y-2">
          {sources.map((row) => (
            <li key={row.key} className="grid gap-2 sm:grid-cols-[130px_1fr_1.4fr_auto]">
              <select
                aria-label={t("sourceKind")}
                value={row.kind}
                onChange={(event) =>
                  setSources((current) =>
                    current.map((entry) =>
                      entry.key === row.key
                        ? { ...entry, kind: event.target.value as TimelineSourceKind }
                        : entry,
                    ),
                  )
                }
                className={inputClass}
              >
                {TIMELINE_SOURCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {tSources(kind)}
                  </option>
                ))}
              </select>
              <input
                aria-label={t("sourceTitle")}
                placeholder={t("sourceTitle")}
                maxLength={MAX_TIMELINE_SHORT_TEXT}
                value={row.title}
                onChange={(event) =>
                  setSources((current) =>
                    current.map((entry) =>
                      entry.key === row.key ? { ...entry, title: event.target.value } : entry,
                    ),
                  )
                }
                className={inputClass}
              />
              <input
                aria-label={t("sourceUrl")}
                type="url"
                placeholder="https://robertsspaceindustries.com/…"
                value={row.url}
                onChange={(event) =>
                  setSources((current) =>
                    current.map((entry) =>
                      entry.key === row.key ? { ...entry, url: event.target.value } : entry,
                    ),
                  )
                }
                className={inputClass}
              />
              <RemoveButton
                label={t("removeSource")}
                onClick={() =>
                  setSources((current) => current.filter((entry) => entry.key !== row.key))
                }
              />
            </li>
          ))}
        </ul>
        {sources.length < MAX_TIMELINE_SOURCES && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSources((current) => [
                ...current,
                { key: nextKey(), kind: "commlink", title: "", url: "" },
              ])
            }
          >
            {t("addSource")}
          </Button>
        )}
      </Section>

      <Section id="rewards" title={t("rewards")} hint={t("rewardsHint")}>
        <div className="space-y-4">
          {tracks.map((track) => (
            <div
              key={track.key}
              className="space-y-3 rounded-lg border border-[#9ED0FF]/14 bg-[#030912]/25 p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  aria-label={t("trackName")}
                  placeholder={t("trackName")}
                  maxLength={60}
                  value={track.name}
                  onChange={(event) =>
                    updateTrack(track.key, (current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={`${inputClass} flex-1 font-semibold`}
                />
                <RemoveButton
                  label={t("removeTrack")}
                  onClick={() =>
                    setTracks((current) => current.filter((entry) => entry.key !== track.key))
                  }
                />
              </div>
              <ol className="space-y-3">
                {track.tiers.map((tier) => (
                  <li key={tier.key} className="space-y-2 border-l-2 border-[#9ED0FF]/20 pl-3">
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={t("tierPoints")}
                        inputMode="numeric"
                        placeholder={t("tierPoints")}
                        value={tier.points}
                        onChange={(event) =>
                          updateTier(track.key, tier.key, (current) => ({
                            ...current,
                            points: event.target.value,
                          }))
                        }
                        className={`${inputClass} w-36 font-mono`}
                      />
                      <span className="text-xs text-muted-foreground">{t("pointsUnit")}</span>
                      <span className="ml-auto">
                        <RemoveButton
                          label={t("removeTier")}
                          onClick={() =>
                            updateTrack(track.key, (current) => ({
                              ...current,
                              tiers: current.tiers.filter((entry) => entry.key !== tier.key),
                            }))
                          }
                        />
                      </span>
                    </div>
                    {tier.rewards.map((reward) => (
                      <RewardField
                        key={reward.key}
                        reward={reward}
                        item={reward.itemSlug ? items[reward.itemSlug] : undefined}
                        onPickItem={(item) =>
                          setItems((current) => ({ ...current, [item.slug]: item }))
                        }
                        onChange={(next) =>
                          updateTier(track.key, tier.key, (current) => ({
                            ...current,
                            rewards: current.rewards.map((entry) =>
                              entry.key === reward.key ? next : entry,
                            ),
                          }))
                        }
                        onRemove={() =>
                          updateTier(track.key, tier.key, (current) => ({
                            ...current,
                            rewards: current.rewards.filter((entry) => entry.key !== reward.key),
                          }))
                        }
                      />
                    ))}
                    {tier.rewards.length < MAX_TIMELINE_REWARDS_PER_TIER && (
                      <button
                        type="button"
                        onClick={() =>
                          updateTier(track.key, tier.key, (current) => ({
                            ...current,
                            rewards: [
                              ...current.rewards,
                              { key: nextKey(), name: "", note: "" },
                            ],
                          }))
                        }
                        className="text-xs text-primary hover:underline"
                      >
                        {t("addReward")}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              {track.tiers.length < MAX_TIMELINE_TIERS && (
                <button
                  type="button"
                  onClick={() =>
                    updateTrack(track.key, (current) => ({
                      ...current,
                      tiers: [
                        ...current.tiers,
                        {
                          key: nextKey(),
                          points: "",
                          rewards: [{ key: nextKey(), name: "", note: "" }],
                        },
                      ],
                    }))
                  }
                  className="text-sm text-primary hover:underline"
                >
                  {t("addTier")}
                </button>
              )}
            </div>
          ))}
        </div>
        {tracks.length < MAX_TIMELINE_TRACKS && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setTracks((current) => [
                ...current,
                {
                  key: nextKey(),
                  name: "",
                  tiers: [
                    {
                      key: nextKey(),
                      points: "",
                      rewards: [{ key: nextKey(), name: "", note: "" }],
                    },
                  ],
                },
              ])
            }
          >
            {t("addTrack")}
          </Button>
        )}
      </Section>

      <Section id="missions" title={t("missions")} hint={t("missionsHint")}>
        <ul className="space-y-2">
          {missions.map((mission) => (
            <MissionField
              key={mission.key}
              mission={mission}
              trackNames={trackNames}
              onChange={(next) =>
                setMissions((current) =>
                  current.map((entry) => (entry.key === mission.key ? next : entry)),
                )
              }
              onRemove={() =>
                setMissions((current) => current.filter((entry) => entry.key !== mission.key))
              }
            />
          ))}
        </ul>
        {missions.length < MAX_TIMELINE_MISSIONS && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setMissions((current) => [
                ...current,
                {
                  key: nextKey(),
                  name: "",
                  track: "",
                  points: "",
                  auec: "",
                  conditions: "",
                },
              ])
            }
          >
            {t("addMission")}
          </Button>
        )}
      </Section>

      <Section id="related" title={t("related")} hint={t("relatedHint")}>
        {related.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {related.map((slug) => (
              <li
                key={slug}
                className="inline-flex items-center gap-1 rounded-full border border-[#9ED0FF]/25 bg-white/5 py-0.5 pl-2.5 pr-1 text-xs"
              >
                {eventOptions.find((option) => option.slug === slug)?.name ?? slug}
                <RemoveButton
                  label={t("removeRelated")}
                  onClick={() =>
                    setRelated((current) => current.filter((entry) => entry !== slug))
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {related.length < MAX_TIMELINE_RELATED && (
          <select
            aria-label={t("addRelated")}
            value=""
            onChange={(event) => {
              const slug = event.target.value;
              if (slug) setRelated((current) => [...current, slug]);
            }}
            className={`${inputClass} w-full sm:w-80`}
          >
            <option value="">{t("addRelated")}</option>
            {eventOptions
              .filter((option) => !related.includes(option.slug))
              .map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
          </select>
        )}
      </Section>

      <ContributionMetaFields value={meta} onChange={setMeta} />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2 border-t border-[#9ED0FF]/15 pt-4">
        <Button type="submit" disabled={pending || uploading}>
          {mode === "create" ? t("submitCreate") : tForm("submit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.back()}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
