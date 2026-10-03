import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPlaceDetails } from "@/lib/places";
import { PlaceForm } from "@/app/admin/lieux/components/place-form";
import { ContributionNotice } from "@/app/contributions/notice";
import {
  requireContributor,
  resumableContribution,
} from "@/app/contributions/session";
import { PlaceBreadcrumb } from "../sections";
import { DIRECT_EDIT_LEVEL, POINTS, RENAME_LEVEL } from "@/types/contributions";
import type { Place } from "@/types/places";

export const metadata: Metadata = {
  title: "Proposer une modification",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Proposer une modification d'un lieu. Le formulaire est celui de l'admin, en
 * mode contribution ; `?c=` reprend une proposition encore ouverte.
 */
export default async function ContributePlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const { c } = await searchParams;
  const { userId, standing } = await requireContributor(
    `/lieux/${slug}/contribuer${c ? `?c=${c}` : ""}`,
  );

  const place = await getPlaceDetails(slug);
  if (!place) notFound();

  const resumed = await resumableContribution(c, userId, "placeEdit", slug);
  const t = await getTranslations("Contributions.Form");

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <PlaceBreadcrumb
        ancestors={[...place.ancestors, place]}
        name={t("editPlaceCrumb")}
      />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {t("editPlaceTitle", { name: place.name })}
        </h1>
        <ContributionNotice
          standing={standing}
          direct={standing.level >= DIRECT_EDIT_LEVEL}
          points={POINTS.edit}
          resumed={resumed}
        />
      </div>

      <PlaceForm
        place={place}
        parentName={place.parentName}
        contribution={{
          mode: "edit",
          canRename: standing.level >= RENAME_LEVEL,
          contributionId: resumed?.id,
          initial: resumed?.proposal as Partial<Place> | undefined,
          source: resumed?.source,
          gameVersion: resumed?.gameVersion,
        }}
      />

      <p className="text-xs text-muted-foreground">
        {t("imagesElsewhere")}{" "}
        <Link href={`/lieux/${place.slug}`} className="text-nexus underline">
          {t("backToPlace")}
        </Link>
      </p>
    </div>
  );
}
