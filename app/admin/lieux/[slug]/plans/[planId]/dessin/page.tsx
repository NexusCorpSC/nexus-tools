import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/permissions";
import { getPlacePlans } from "@/lib/places";
import { isDrawnPlan, PLACES_EDIT_PERMISSION } from "@/types/places";
import { DrawnPlanWorkspace } from "../../../../components/drawn-plan-workspace";

export const metadata: Metadata = {
  title: "Table à dessin",
  robots: { index: false, follow: false },
};

/**
 * La table à dessin, sur l'écran entier.
 *
 * Elle a sa propre route parce qu'elle a besoin de tout l'écran : rail,
 * règles, calques et inspecteur ne tiennent pas dans la colonne centrale de la
 * page des plans, et un relevé qu'on dessine sur huit cents pixels ne se
 * dessine pas.
 *
 * Elle charge **tous** les plans du lieu, pas seulement celui qu'on ouvre :
 * `savePlacePlans` les remplace en bloc, et n'en renvoyer qu'un effacerait les
 * autres.
 */
export default async function DrawPlanPage({
  params,
}: {
  params: Promise<{ slug: string; planId: string }>;
}) {
  await requirePermission(PLACES_EDIT_PERMISSION);

  const { slug, planId } = await params;
  const place = await getPlacePlans(slug);
  if (!place) notFound();

  const plan = place.plans.find((entry) => entry.id === planId);
  // Un plan image n'a rien à faire ici : il se modifie sur la page des plans.
  if (!plan || !isDrawnPlan(plan)) notFound();

  return (
    <DrawnPlanWorkspace
      slug={place.slug}
      placeName={place.name}
      planId={planId}
      initialPlans={place.plans}
    />
  );
}
