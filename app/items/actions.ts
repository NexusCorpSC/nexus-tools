"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import {
  createItem,
  deleteItem,
  updateItem,
  type ItemInput,
} from "@/lib/items";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";

export type ItemActionResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

function revalidateItem(slug?: string) {
  revalidatePath("/items");
  revalidatePath("/admin/items");
  if (slug) {
    revalidatePath(`/items/${slug}`);
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Une erreur est survenue";
}

export async function createItemAction(
  input: ItemInput,
): Promise<ItemActionResult> {
  await requirePermission(ITEMS_EDIT_PERMISSION);

  try {
    const item = await createItem(input);
    revalidateItem(item.slug);
    return { ok: true, slug: item.slug };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function updateItemAction(
  currentSlug: string,
  input: ItemInput,
): Promise<ItemActionResult> {
  await requirePermission(ITEMS_EDIT_PERMISSION);

  try {
    const item = await updateItem(currentSlug, input);
    revalidateItem(currentSlug);
    // A renamed item lives at a new url: both have to be refreshed.
    revalidateItem(item.slug);
    return { ok: true, slug: item.slug };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function deleteItemAction(
  slug: string,
): Promise<ItemActionResult> {
  await requirePermission(ITEMS_EDIT_PERMISSION);

  try {
    const deleted = await deleteItem(slug);
    if (!deleted) {
      return { ok: false, error: "Objet introuvable" };
    }
    revalidateItem(slug);
    return { ok: true, slug };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
