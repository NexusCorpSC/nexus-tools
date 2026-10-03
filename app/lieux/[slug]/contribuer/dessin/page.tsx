import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireContributor } from "@/app/contributions/session";
import { PlanContribution } from "../plan-contribution";
import { loadContributedPlan } from "../plans";

export const metadata: Metadata = {
  title: "Dessiner un plan",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * La table à dessin, pour un relevé proposé. Le même éditeur que l'admin, sur
 * l'écran entier ; chaque enregistrement part en contribution.
 */
export default async function ContributeDrawnPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { slug } = await params;
  const { plan: planId } = await searchParams;
  const { userId } = await requireContributor(
    `/lieux/${slug}/contribuer/dessin${planId ? `?plan=${planId}` : ""}`,
  );

  const loaded = await loadContributedPlan(slug, userId, planId);
  if (!loaded) notFound();
  if (loaded.plan && loaded.kind === "image") {
    redirect(`/lieux/${slug}/contribuer/plan?plan=${planId}`);
  }

  const { place, open, plan } = loaded;
  return (
    <PlanContribution
      slug={place.slug}
      placeName={place.name}
      kind="drawn"
      plan={plan}
      targets={place.targets}
      source={open?.source}
      gameVersion={open?.gameVersion}
    />
  );
}
