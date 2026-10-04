import "server-only";
import type { ObjectId } from "mongodb";
import { getPlacePlans } from "@/lib/places";
import { listMyOpenContributions } from "@/lib/contributions";
import { isDrawnPlan, type PlacePlan } from "@/types/places";
import type { Contribution } from "@/types/contributions";

/**
 * Le plan qu'ouvre une page de contribution : la proposition encore ouverte
 * de ce joueur sur ce plan, sinon le plan publié (s'il est bien à ce lieu),
 * sinon rien — la page en crée un neuf.
 */
export async function loadContributedPlan(
  slug: string,
  userId: ObjectId,
  planId: string | undefined,
) {
  const place = await getPlacePlans(slug);
  if (!place) return null;

  let open: Contribution | undefined;
  let plan: PlacePlan | undefined;
  if (planId) {
    open = (
      await listMyOpenContributions(userId, { type: "place", slug })
    ).find((entry) => entry.kind === "plan" && entry.target.planId === planId);
    plan =
      (open?.proposal as PlacePlan | undefined) ??
      place.plans.find((entry) => entry.id === planId && !entry.borrowedFrom);
  }

  return {
    place,
    open,
    plan,
    kind: plan && isDrawnPlan(plan) ? ("drawn" as const) : ("image" as const),
  };
}
