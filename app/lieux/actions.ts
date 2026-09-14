"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import {
  createPlace,
  deletePlace,
  savePlacePlans,
  updatePlace,
  type PlaceInput,
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
