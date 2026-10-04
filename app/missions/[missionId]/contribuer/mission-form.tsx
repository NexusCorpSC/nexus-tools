"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlacePicker } from "@/app/lieux/place-picker";
import {
  ContributionMetaFields,
  useContribute,
  type ContributionMetaValue,
} from "@/app/contributions/contribute-kit";
import {
  MAX_MISSION_PLACES,
  MAX_MISSION_TIP_LENGTH,
} from "@/types/contributions";

type PickedPlace = { slug: string; name: string };

export function MissionForm({
  missionId,
  initialPlaces,
  initialTip,
  contributionId,
  source,
  gameVersion,
}: {
  missionId: string;
  initialPlaces: PickedPlace[];
  initialTip: string;
  contributionId?: string;
  source?: string;
  gameVersion?: string;
}) {
  const t = useTranslations("Missions.Contribute");
  const tForm = useTranslations("Contributions.Form");
  const router = useRouter();
  const { contribute, errorMessage } = useContribute();
  const [places, setPlaces] = useState(initialPlaces);
  const [tip, setTip] = useState(initialTip);
  const [meta, setMeta] = useState<ContributionMetaValue>({
    source: source ?? "",
    gameVersion: gameVersion ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await contribute(
        {
          kind: "missionEdit",
          missionId,
          input: { placeSlugs: places.map((place) => place.slug), tip },
        },
        { ...meta, contributionId },
      );
      if (!result.ok) {
        setError(errorMessage(result));
        return;
      }
      router.push(`/missions/${missionId}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <Label>{t("places")}</Label>
        {places.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {places.map((place) => (
              <li
                key={place.slug}
                className="inline-flex items-center gap-1 rounded-full border border-[#9ED0FF]/25 bg-white/5 py-0.5 pl-2.5 pr-1 text-xs"
              >
                {place.name}
                <button
                  type="button"
                  aria-label={t("remove")}
                  onClick={() =>
                    setPlaces((current) =>
                      current.filter((entry) => entry.slug !== place.slug),
                    )
                  }
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-white/10 hover:text-nexus"
                >
                  <XMarkIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {places.length < MAX_MISSION_PLACES && (
          <PlacePicker
            placeholder={t("placesPlaceholder")}
            onChange={(place) => {
              if (!place) return;
              setPlaces((current) =>
                current.some((entry) => entry.slug === place.slug)
                  ? current
                  : [...current, { slug: place.slug, name: place.name }],
              );
            }}
          />
        )}
        <p className="text-xs text-muted-foreground">{t("placesHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mission-tip">{t("tip")}</Label>
        <Textarea
          id="mission-tip"
          rows={4}
          maxLength={MAX_MISSION_TIP_LENGTH}
          value={tip}
          onChange={(event) => setTip(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("tipHint")}</p>
      </div>

      <ContributionMetaFields value={meta} onChange={setMeta} />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2 border-t border-[#9ED0FF]/15 pt-4">
        <Button type="submit" disabled={pending}>
          {tForm("submit")}
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
