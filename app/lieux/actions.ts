"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import {
  createPlace,
  deletePlace,
  removeBorrowedPlan,
  savePlacePlans,
  sharePlanToPlaces,
  updatePlace,
  type PlaceInput,
  type SharePlanReport,
} from "@/lib/places";
import { PLACES_EDIT_PERMISSION } from "@/types/places";

export type PlaceActionResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

function revalidatePlace(slug?: string) {
  revalidatePath("/lieux");
  revalidatePath("/admin/lieux");
  if (slug) {
    revalidatePath(`/lieux/${slug}`);
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Une erreur est survenue";
}

export async function createPlaceAction(
  input: PlaceInput,
): Promise<PlaceActionResult> {
  await requirePermission(PLACES_EDIT_PERMISSION);

  try {
    const place = await createPlace(input);
    revalidatePlace(place.slug);
    // Le lieu qui le contient affiche désormais un lieu de plus.
    revalidatePlace(place.parentSlug);
    return { ok: true, slug: place.slug };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function updatePlaceAction(
  currentSlug: string,
  input: PlaceInput,
): Promise<PlaceActionResult> {
  await requirePermission(PLACES_EDIT_PERMISSION);

  try {
    const place = await updatePlace(currentSlug, input);
    revalidatePlace(currentSlug);
    // Un lieu renommé vit à une nouvelle adresse : les deux sont à rafraîchir,
    // et le lieu qui le contient peut avoir changé aussi.
    revalidatePlace(place.slug);
    revalidatePlace(place.parentSlug);
    return { ok: true, slug: place.slug };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function deletePlaceAction(
  slug: string,
): Promise<PlaceActionResult> {
  await requirePermission(PLACES_EDIT_PERMISSION);

  try {
    const deleted = await deletePlace(slug);
    if (!deleted) {
      return { ok: false, error: "Lieu introuvable" };
    }
    revalidatePlace(slug);
    return { ok: true, slug };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Les plans d'un lieu sont remplacés en bloc : l'éditeur tient l'état complet
 * et l'envoie d'une pièce, ce qui fait de l'enregistrement une écriture unique
 * et de l'annulation une simple affaire d'état local.
 */
export async function savePlacePlansAction(
  slug: string,
  plans: unknown,
): Promise<PlaceActionResult> {
  await requirePermission(PLACES_EDIT_PERMISSION);

  try {
    const place = await savePlacePlans(slug, plans);
    revalidatePlace(place.slug);
    return { ok: true, slug: place.slug };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Fait afficher un plan par plusieurs lieux d'un coup, depuis l'écran de
 * liaison. Le rapport revient au client : lier sept lieux sur dix n'est pas un
 * succès s'il ne dit pas lesquels manquent, ni pourquoi.
 *
 * Chaque lieu touché voit sa page revalidée — un emprunt change ce qu'elle
 * montre, pas seulement ce que la base contient.
 */
export async function sharePlanAction(
  sourceSlug: string,
  sourcePlanId: string,
  targetSlugs: string[],
): Promise<({ ok: true } & SharePlanReport) | { ok: false; error: string }> {
  await requirePermission(PLACES_EDIT_PERMISSION);

  try {
    const report = await sharePlanToPlaces(
      sourceSlug,
      sourcePlanId,
      targetSlugs,
    );
    revalidatePlace(sourceSlug);
    // Seulement ce qui a bougé : `targetSlugs` arrive tel que le client l'a
    // envoyé, doublons et lieux déjà emprunteurs compris, et revalider une
    // page qu'on n'a pas touchée ne fait que du travail de cache.
    for (const slug of report.linked) revalidatePath(`/lieux/${slug}`);
    return { ok: true, ...report };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** Le lieu cesse d'afficher le plan du voisin. La source n'est pas touchée. */
export async function removeBorrowedPlanAction(
  slug: string,
  planId: string,
): Promise<PlaceActionResult> {
  await requirePermission(PLACES_EDIT_PERMISSION);

  try {
    const place = await removeBorrowedPlan(slug, planId);
    revalidatePlace(place.slug);
    return { ok: true, slug: place.slug };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
