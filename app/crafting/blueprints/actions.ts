"use server";

import { auth } from "@/auth";
import { addBlueprintToUser, removeBlueprintFromUser } from "@/lib/crafting";
import { revalidatePath } from "next/cache";

export async function addBlueprintAction(blueprintId: string, slug: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Not authenticated");
  }
  await addBlueprintToUser(session.user.id!, blueprintId);
  revalidatePath(`/crafting/blueprints/${slug}`);
}

export async function removeBlueprintAction(blueprintId: string, slug: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Not authenticated");
  }
  await removeBlueprintFromUser(session.user.id!, blueprintId);
  revalidatePath(`/crafting/blueprints/${slug}`);
}
