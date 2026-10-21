"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ItemSummary } from "@/types/items";
import type { TimelineTrack } from "@/types/timeline-events";

type MissionHint = { name: string; track?: string; points?: number };

/** Ce que vaut un parcours pour ces points : les paliers atteints, le suivant. */
function standing(track: TimelineTrack, points: number) {
  const max = track.tiers.at(-1)?.points ?? 0;
  const next = track.tiers.find((tier) => tier.points > points);
  return { max, next };
}

function parsePoints(value: string): number | undefined {
  const number = Number(value.replace(/[\s ]/g, ""));
  return value.trim() === "" || !Number.isFinite(number) || number < 0
    ? undefined
    : Math.round(number);
}

function RewardItem({
  reward,
  item,
}: {
  reward: TimelineTrack["tiers"][number]["rewards"][number];
  item?: ItemSummary;
}) {
  const t = useTranslations("Timeline.Rewards");
  if (item) {
    return (
      <Link
        href={`/items/${item.slug}`}
        className="group -m-1 flex items-center gap-2 rounded-lg p-1 no-underline hover:bg-[#9ED0FF]/8"
      >
        <span className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-[#9ED0FF]/25 bg-[radial-gradient(circle_at_30%_25%,#2f5f86,#0b2238_75%)]">
          {item.imageUrl && (
            <Image
              src={item.imageUrl}
              alt=""
              fill
              sizes="44px"
              className="object-cover"
            />
          )}
        </span>
        <span className="min-w-0 text-[12.5px] leading-tight">
          <span className="block font-medium text-[#E3F1FF] group-hover:underline">
            {item.name}
          </span>
          {reward.note && (
            <span className="block text-[11.5px] text-muted-foreground">
              {reward.note}
            </span>
          )}
        </span>
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-11 shrink-0 rounded-lg border border-dashed border-[#9ED0FF]/30"
      />
      <span className="min-w-0 text-[12.5px] leading-tight">
        <span className="block text-[#E3F1FF]">{reward.name ?? reward.itemSlug}</span>
        <span className="block text-[11.5px] text-muted-foreground">
          {[reward.note, t("noPage")].filter(Boolean).join(" · ")}
        </span>
      </span>
    </span>
  );
}

/**
 * Les parcours de récompenses, et « Ma progression » : le joueur recopie ses
 * points du mobiGlas, Nexus marque les paliers atteints et dit ce qu'il reste
 * à faire, en contrats du parcours quand on en connaît.
 */
export function RewardTracks({
  slug,
  tracks,
  missions,
  items,
  initialProgress,
  signedIn,
}: {
  slug: string;
  tracks: TimelineTrack[];
  missions: MissionHint[];
  items: Record<string, ItemSummary>;
  initialProgress: Record<string, number>;
  signedIn: boolean;
}) {
  const t = useTranslations("Timeline.Rewards");
  const format = useFormatter();
  const pathname = usePathname();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      tracks.map((track) => [
        track.id,
        initialProgress[track.id] !== undefined
          ? String(initialProgress[track.id])
          : "",
      ]),
    ),
  );
  const [saved, setSaved] = useState<Record<string, number>>(initialProgress);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const points = (id: string) => parsePoints(values[id] ?? "") ?? 0;
  const dirty = tracks.some(
    (track) => parsePoints(values[track.id] ?? "") !== saved[track.id],
  );

  const save = () => {
    startTransition(async () => {
      const body = Object.fromEntries(
        tracks.flatMap((track) => {
          const value = parsePoints(values[track.id] ?? "");
          return value === undefined ? [] : [[track.id, value]];
        }),
      );
      const response = await fetch(`/api/timeline-events/${slug}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: body }),
      });
      if (!response.ok) {
        setState("error");
        return;
      }
      const result = (await response.json()) as { points: Record<string, number> };
      setSaved(result.points);
      setState("saved");
    });
  };

  /** Le contrat du parcours qui rapporte le plus : de quoi chiffrer le reste. */
  const bestMission = (track: TimelineTrack) =>
    missions
      .filter(
        (mission) =>
          mission.points &&
          mission.name &&
          mission.track?.toLowerCase() === track.name.toLowerCase(),
      )
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];

  const hints = tracks.flatMap((track) => {
    const current = points(track.id);
    const { next } = standing(track, current);
    if (!next || current === 0) return [];
    const missing = next.points - current;
    const mission = bestMission(track);
    return [
      {
        id: track.id,
        text: t("nextTier", {
          track: track.name,
          tier: format.number(next.points),
          missing: format.number(missing),
        }),
        mission: mission
          ? t("nextTierMission", {
              count: Math.ceil(missing / (mission.points ?? 1)),
              mission: mission.name,
            })
          : null,
      },
    ];
  });

  if (tracks.length === 0) {
    return (
      <section className="rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5">
        <p className="text-sm text-muted-foreground">{t("none")}</p>
        <Link href={`/timeline/${slug}/modifier#rewards`} className="mt-2 inline-block text-sm">
          {t("addTrack")}
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="my-progress"
        className="space-y-3 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 id="my-progress" className="text-base font-semibold">
            {t("myProgress")}
          </h2>
          <span className="text-xs text-muted-foreground">{t("myProgressHint")}</span>
        </div>
        {signedIn ? (
          <>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {tracks.map((track) => (
                <label
                  key={track.id}
                  htmlFor={`progress-${track.id}`}
                  className="flex flex-col gap-1 text-[12.5px] text-muted-foreground"
                >
                  {track.name}
                  <input
                    id={`progress-${track.id}`}
                    inputMode="numeric"
                    value={values[track.id] ?? ""}
                    placeholder="0"
                    onChange={(event) => {
                      setState("idle");
                      setValues((current) => ({
                        ...current,
                        [track.id]: event.target.value,
                      }));
                    }}
                    className="h-9 rounded-lg border border-[#9ED0FF]/25 bg-[#071E30] px-2.5 font-mono text-sm text-[#E3F1FF]"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={pending || !dirty}
                onClick={save}
                className="h-8 rounded-lg bg-[#2C7BE5] px-3 text-[13px] font-semibold text-white hover:bg-[#2569C4] disabled:opacity-50"
              >
                {t("save")}
              </button>
              <span role="status" className="text-xs text-muted-foreground">
                {state === "saved" && !dirty && t("saved")}
                {state === "error" && t("saveError")}
              </span>
            </div>
            {hints.length > 0 && (
              <ul className="space-y-1 text-[13px]">
                {hints.map((hint) => (
                  <li key={hint.id}>
                    <b className="font-semibold text-[#7FF0D0]">{hint.text}</b>
                    {hint.mission && (
                      <span className="text-muted-foreground"> · {hint.mission}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-nexus">
            <Link href={`/login?callbackUrl=${encodeURIComponent(`${pathname}?tab=rewards`)}`}>
              {t("signIn")}
            </Link>{" "}
            {t("signInHint")}
          </p>
        )}
      </section>

      <section aria-labelledby="rewards-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 id="rewards-title" className="text-lg font-semibold">
            {t("title")}
          </h2>
          <span className="text-xs text-muted-foreground">{t("hint")}</span>
        </div>
        <div className={`grid gap-3.5 ${tracks.length > 1 ? "xl:grid-cols-2" : ""}`}>
          {tracks.map((track) => {
            const current = points(track.id);
            const { max } = standing(track, current);
            const percent = (value: number) =>
              max > 0 ? Math.min(100, (value / max) * 100) : 0;
            return (
              <article
                key={track.id}
                className="space-y-3.5 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-[#E3F1FF]">{track.name}</h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    {signedIn
                      ? `${format.number(current)} / ${format.number(max)}`
                      : format.number(max)}
                  </span>
                </div>
                <div
                  className="relative h-2.5 rounded-full bg-[#9ED0FF]/15"
                  role="img"
                  aria-label={t("barLabel", {
                    points: format.number(current),
                    max: format.number(max),
                  })}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-[#7FF0D0]"
                    style={{ width: `${percent(current)}%` }}
                  />
                  {track.tiers.map((tier, index) => (
                    <span
                      key={index}
                      className="absolute -top-1 h-[18px] w-0.5 rounded-sm bg-[#CCE7FF]"
                      style={{ left: `calc(${percent(tier.points)}% - 1px)` }}
                    />
                  ))}
                </div>
                <ol className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                  {track.tiers.map((tier, index) => {
                    const reached = signedIn && current >= tier.points && tier.points > 0;
                    return (
                      <li
                        key={index}
                        className={`flex flex-col gap-2 rounded-lg border p-2.5 ${
                          reached
                            ? "border-[#7FF0D0]/45 bg-[#7FF0D0]/6"
                            : "border-[#9ED0FF]/14 bg-[#030912]/25"
                        }`}
                      >
                        <span className="font-mono text-xs text-[#CCE7FF]">
                          {format.number(tier.points)}
                          {reached && (
                            <span className="text-[#7FF0D0]"> ✓<span className="sr-only">{t("reached")}</span></span>
                          )}
                        </span>
                        {tier.rewards.map((reward, rewardIndex) => (
                          <RewardItem
                            key={rewardIndex}
                            reward={reward}
                            item={reward.itemSlug ? items[reward.itemSlug] : undefined}
                          />
                        ))}
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
