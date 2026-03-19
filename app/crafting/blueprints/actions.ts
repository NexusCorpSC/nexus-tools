"use server";

import {
  addBlueprintToUser,
  removeBlueprintFromUser,
  deleteBlueprint,
  updateBlueprint,
  createBlueprint,
} from "@/lib/crafting";
import { revalidatePath } from "next/cache";
import { roundQty } from "@/lib/utils";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/permissions";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { BlueprintRecipeStep } from "@/types/crafting";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QualityMode =
  | { type: "max" }
  | { type: "min" }
  | { type: "gte"; value: number };

export type InventoryComponentMatch = {
  componentName: string;
  requiredQuantity: number;
  requiredUnit?: string;
  recipeMinQuality?: number;
  selectedQuality?: number;
  items: Array<{
    id: string;
    quality?: number;
    quantity: number;
    unit?: string;
    locationId: string;
    locationName?: string;
  }>;
  totalAvailable: number;
};

export async function addBlueprintAction(blueprintId: string, slug: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    throw new Error("Not authenticated");
  }
  await addBlueprintToUser(session.user.id!, blueprintId);
  revalidatePath(`/crafting/blueprints/${slug}`);
}

export async function removeBlueprintAction(blueprintId: string, slug: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    throw new Error("Not authenticated");
  }
  await removeBlueprintFromUser(session.user.id!, blueprintId);
  revalidatePath(`/crafting/blueprints/${slug}`);
}

export async function deleteBlueprintAction(blueprintId: string) {
  await requireAdmin();
  await deleteBlueprint(blueprintId);
  revalidatePath("/crafting/blueprints");
  redirect("/crafting/blueprints");
}

export async function updateBlueprintAction(
  blueprintId: string,
  oldSlug: string,
  data: {
    name: string;
    description: string;
    category: string;
    subcategory?: string;
    slug: string;
    imageUrl?: string;
    tier?: number;
    craftingTime?: number;
    statistics?: {
      [statName: string]: { value: string | number; unit?: string };
    };
    recipe?: { [componentName: string]: { quantity: number; unit?: string } }[];
    obtention?: string;
  },
) {
  await requireAdmin();
  await updateBlueprint(blueprintId, data);
  revalidatePath(`/crafting/blueprints/${oldSlug}`);
  revalidatePath(`/crafting/blueprints/${data.slug}`);
  revalidatePath("/crafting/blueprints");
  redirect(`/crafting/blueprints/${data.slug}`);
}

export async function createBlueprintAction(data: {
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  slug: string;
  imageUrl?: string;
  tier?: number;
  craftingTime?: number;
  statistics?: {
    [statName: string]: { value: string | number; unit?: string };
  };
  recipe?: { [componentName: string]: { quantity: number; unit?: string } }[];
  obtention?: string;
}) {
  await requireAdmin();
  const slug = await createBlueprint(data);
  revalidatePath("/crafting/blueprints");
  redirect(`/crafting/blueprints/${slug}`);
}

export async function findInventoryForRecipe(
  recipe: BlueprintRecipeStep[],
  qualityMode: QualityMode,
): Promise<{ ok: boolean; matches?: InventoryComponentMatch[]; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  const userId = session.user.id;
  const itemsCol = db.db().collection("inventoryItems");
  const locsCol = db.db().collection("locations");

  // Flatten recipe steps into a list of components
  const components: {
    name: string;
    quantity: number;
    unit?: string;
    minQuality?: number;
  }[] = [];
  for (const step of recipe) {
    for (const [name, v] of Object.entries(step)) {
      components.push({
        name,
        quantity: v.quantity,
        unit: v.unit,
        minQuality: v.minQuality,
      });
    }
  }

  const matches: InventoryComponentMatch[] = [];

  for (const component of components) {
    // Escape special regex characters to prevent injection
    const escapedName = component.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const allItems = await itemsCol
      .find({ userId, name: { $regex: `^${escapedName}$`, $options: "i" } })
      .toArray();

    if (allItems.length === 0) {
      matches.push({
        componentName: component.name,
        requiredQuantity: component.quantity,
        requiredUnit: component.unit,
        recipeMinQuality: component.minQuality,
        selectedQuality: undefined,
        items: [],
        totalAvailable: 0,
      });
      continue;
    }

    const qualities = allItems.map((i) =>
      typeof i.quality === "number" ? i.quality : 0,
    );

    let targetQuality: number | undefined;
    if (qualityMode.type === "max") {
      targetQuality = Math.max(...qualities);
    } else if (qualityMode.type === "min") {
      targetQuality = Math.min(...qualities);
    } else {
      const eligible = qualities.filter((q) => q >= qualityMode.value);
      if (eligible.length > 0) {
        targetQuality = Math.min(...eligible);
      }
    }

    const filteredItems =
      targetQuality !== undefined
        ? allItems.filter(
            (i) =>
              (typeof i.quality === "number" ? i.quality : 0) === targetQuality,
          )
        : [];

    // Fetch location names for the matching items
    const locationIds = [
      ...new Set(
        filteredItems
          .map((i) => i.locationId as string)
          .filter(Boolean),
      ),
    ];
    const locationDocs =
      locationIds.length > 0
        ? await locsCol
            .find({
              $expr: { $in: [{ $toString: "$_id" }, locationIds] },
            })
            .toArray()
        : [];
    const locationMap = new Map(
      locationDocs.map((l) => [l._id.toString(), l.name as string]),
    );

    const items = filteredItems.map((item) => ({
      id: item._id.toString(),
      quality: item.quality as number | undefined,
      quantity: item.quantity as number,
      unit: item.unit as string | undefined,
      locationId: item.locationId as string,
      locationName: locationMap.get(item.locationId as string),
    }));

    const totalAvailable = items.reduce((sum, i) => sum + i.quantity, 0);

    matches.push({
      componentName: component.name,
      requiredQuantity: component.quantity,
      requiredUnit: component.unit,
      recipeMinQuality: component.minQuality,
      selectedQuality: targetQuality,
      items,
      totalAvailable,
    });
  }

  return { ok: true, matches };
}

export async function craftFromInventory(
  entries: { itemId: string; quantity: number }[],
  output?: { locationId: string; name: string; quantity?: number },
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  const userId = session.user.id;
  const collection = db.db().collection("inventoryItems");
  const now = new Date().toISOString();

  for (const { itemId, quantity } of entries) {
    if (!quantity || quantity <= 0) continue;

    let oid: ObjectId;
    try {
      oid = new ObjectId(itemId);
    } catch {
      continue;
    }

    const item = await collection.findOne({ _id: oid, userId });
    if (!item) continue;

    const remaining = roundQty((item.quantity as number) - quantity);
    if (remaining <= 0) {
      await collection.deleteOne({ _id: oid });
    } else {
      await collection.updateOne(
        { _id: oid },
        { $set: { quantity: remaining, updatedAt: now } },
      );
    }
  }

  // Si un lieu de stockage est précisé, ajouter l'objet fabriqué à l'inventaire
  if (output?.locationId && output?.name) {
    await collection.insertOne({
      name: output.name,
      quantity: output.quantity ?? 1,
      locationId: output.locationId,
      userId,
      updatedAt: now,
    });
  }

  return { ok: true };
}
