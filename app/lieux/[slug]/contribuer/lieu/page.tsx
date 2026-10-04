import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPlaceDetails } from "@/lib/places";
import { PlaceForm } from "@/app/admin/lieux/components/place-form";
import { ContributionNotice } from "@/app/contributions/notice";
import {
  requireContributor,
  resumableContribution,
} from "@/app/contributions/session";
import { PlaceBreadcrumb } from "../../sections";
import { DIRECT_EDIT_LEVEL, POINTS } from "@/types/contributions";
import type { Place } from "@/types/places";

export const metadata: Metadata = {
  title: "Proposer un lieu",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Proposer un lieu contenu dans celui-ci : « Il manque un lieu ici ? ». Le
 * parent est imposé — c'est lui qui donne au lieu sa place dans l'arbre, et
 * la détection de doublon se fait par le nom.
 */
export default async function ProposePlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const { c } = await searchParams;
  const { userId, standing } = await requireContributor(
    `/lieux/${slug}/contribuer/lieu${c ? `?c=${c}` : ""}`,
  );

  const parent = await getPlaceDetails(slug);
  if (!parent) notFound();

  const resumed = await resumableContribution(c, userId, "placeCreate", slug);

  const t = await getTranslations("Contributions.Form");

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <PlaceBreadcrumb
        ancestors={[...parent.ancestors, parent]}
        name={t("newPlaceCrumb")}
      />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {t("newPlaceTitle", { name: parent.name })}
        </h1>
        <ContributionNotice
          standing={standing}
          direct={standing.level >= DIRECT_EDIT_LEVEL}
          points={POINTS.placeCreate}
          resumed={resumed}
        />
        {parent.children.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("newPlaceExisting", {
              names: parent.children
                .slice(0, 8)
                .map((child) => child.name)
                .join(", "),
            })}
          </p>
        )}
      </div>

      <PlaceForm
        contribution={{
          mode: "create",
          parentSlug: parent.slug,
          parentName: parent.name,
          contributionId: resumed?.id,
          initial: resumed?.proposal as Partial<Place> | undefined,
          source: resumed?.source,
          gameVersion: resumed?.gameVersion,
        }}
      />
    </div>
  );
}
