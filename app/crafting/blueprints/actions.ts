"use server";

import { addBlueprintToUser, removeBlueprintFromUser } from "@/lib/crafting";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

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
