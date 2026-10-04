import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ContributionNotice } from "@/app/contributions/notice";
import { requireContributor } from "@/app/contributions/session";
import { DIRECT_EDIT_LEVEL, POINTS } from "@/types/contributions";
import { PlaceBreadcrumb } from "../../sections";
import { PlanContribution } from "../plan-contribution";
import { loadContributedPlan } from "../plans";

export const metadata: Metadata = {
  title: "Proposer un plan",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Envoyer l'image d'un plan et y poser les repères, ou reprendre un plan image. */
export default async function ContributePlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { slug } = await params;
  const { plan: planId } = await searchParams;
  const { userId, standing } = await requireContributor(
    `/lieux/${slug}/contribuer/plan${planId ? `?plan=${planId}` : ""}`,
  );

  const loaded = await loadContributedPlan(slug, userId, planId);
  if (!loaded) notFound();
  // Un relevé dessiné se reprend sur la table à dessin.
  if (loaded.kind === "drawn") {
    redirect(`/lieux/${slug}/contribuer/dessin?plan=${planId}`);
  }

  const t = await getTranslations("Contributions.Form");
  const { place, open, plan } = loaded;

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <PlaceBreadcrumb
        ancestors={[...place.ancestors, place]}
        name={t("planCrumb")}
      />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {plan
            ? t("planEditTitle", { name: plan.name })
            : t("planNewTitle", { name: place.name })}
        </h1>
        <ContributionNotice
          standing={standing}
          direct={standing.level >= DIRECT_EDIT_LEVEL}
          points={plan && !open ? POINTS.edit : POINTS.planImage}
          resumed={open}
        />
        <p className="text-sm text-muted-foreground">{t("planImageHint")}</p>
      </div>

      <PlanContribution
        slug={place.slug}
        placeName={place.name}
        kind="image"
        plan={plan}
        targets={place.targets}
        source={open?.source}
        gameVersion={open?.gameVersion}
      />
    </div>
  );
}
