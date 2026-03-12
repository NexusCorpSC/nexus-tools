"use server";

import {
  addBlueprintToUser,
  removeBlueprintFromUser,
  deleteBlueprint,
  updateBlueprint,
  createBlueprint,
} from "@/lib/crafting";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/permissions";

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
