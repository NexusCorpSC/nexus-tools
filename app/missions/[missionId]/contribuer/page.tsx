import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMissionForEdit } from "@/lib/missions";
import { getPlacesBySlugs } from "@/lib/places";
import { ContributionNotice } from "@/app/contributions/notice";
import {
  openEditOn,
  requireContributor,
  resumableContribution,
} from "@/app/contributions/session";
import {
  DIRECT_EDIT_LEVEL,
  POINTS,
  type Contribution,
} from "@/types/contributions";
import type { MissionCommunity } from "@/lib/missions";
import { MissionForm } from "./mission-form";

export const metadata: Metadata = {
  title: "Compléter une mission",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Où se joue une mission, et l'astuce qui aide à la réussir : ce que la
 * communauté y ajoute. `?c=` reprend une proposition encore ouverte.
 */
export default async function ContributeMissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ missionId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { missionId } = await params;
  const { c } = await searchParams;
  const { userId, standing } = await requireContributor(
    `/missions/${missionId}/contribuer${c ? `?c=${c}` : ""}`,
  );

  const mission = await getMissionForEdit(missionId);
  if (!mission) notFound();

  const resumed: Contribution | null =
    (await resumableContribution(c, userId, "missionEdit", mission.id)) ??
    (await openEditOn(userId, "missionEdit", mission.id));
  const initial = {
    placeSlugs: mission.placeSlugs,
    tip: mission.tip,
    ...((resumed?.proposal as MissionCommunity | undefined) ?? {}),
  };
  const [t, places] = await Promise.all([
    getTranslations("Missions.Contribute"),
    getPlacesBySlugs(initial.placeSlugs),
  ]);

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="space-y-2">
        <Link
          href={`/missions/${mission.id}`}
          className="text-sm text-primary hover:underline"
        >
          {t("back", { title: mission.title })}
        </Link>
        <h1 className="text-2xl font-bold">
          {t("title", { title: mission.title })}
        </h1>
        <ContributionNotice
          standing={standing}
          direct={standing.level >= DIRECT_EDIT_LEVEL}
          points={POINTS.edit}
          resumed={resumed}
        />
      </div>

      <MissionForm
        missionId={mission.id}
        initialPlaces={places.map((place) => ({
          slug: place.slug,
          name: place.name,
        }))}
        initialTip={initial.tip ?? ""}
        contributionId={resumed?.id}
        source={resumed?.source}
        gameVersion={resumed?.gameVersion}
      />
    </div>
  );
}
