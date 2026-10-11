import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPlaceBySlug } from "@/lib/places";
import { PlaceForm } from "@/app/admin/lieux/components/place-form";
import { ContributionNotice } from "@/app/contributions/notice";
import { requireContributor } from "@/app/contributions/session";
import { PlaceBreadcrumb } from "../[slug]/sections";
import { DIRECT_EDIT_LEVEL, POINTS } from "@/types/contributions";

export const metadata: Metadata = {
  title: "Proposer un lieu",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Proposer un lieu qui manque au catalogue, depuis la liste des lieux : le
 * pendant de « Proposer un objet ». Le parent se choisit dans le formulaire
 * (`?parent=` le préremplit) ; depuis une fiche, « Il manque un lieu ici ? »
 * l'impose. Une proposition se reprend là où son parent l'accueille.
 */
export default async function ProposeAnyPlacePage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  const { parent: parentSlug } = await searchParams;
  const { standing } = await requireContributor(
    `/lieux/proposer${parentSlug ? `?parent=${encodeURIComponent(parentSlug)}` : ""}`,
  );

  const parent = parentSlug ? await getPlaceBySlug(parentSlug) : null;
  const t = await getTranslations("Contributions.Form");

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <PlaceBreadcrumb ancestors={[]} name={t("newPlaceCrumb")} />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("newPlaceCrumb")}</h1>
        <ContributionNotice
          standing={standing}
          direct={standing.level >= DIRECT_EDIT_LEVEL}
          points={POINTS.placeCreate}
          resumed={null}
        />
        <p className="text-sm text-muted-foreground">{t("newPlaceHint")}</p>
      </div>

      <PlaceForm
        contribution={{
          mode: "create",
          pickParent: true,
          parentSlug: parent?.slug,
          parentName: parent?.name,
        }}
      />
    </div>
  );
}
