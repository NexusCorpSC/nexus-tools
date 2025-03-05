"use server";

import { auth } from "@/auth";
import db from "@/lib/db";
import { Organization } from "@/app/orgs/page";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";

export async function updateOrgProfileAction(formData: FormData) {
  const orgId = formData.get("orgId") as string;
  const name = formData.get("name") as string;
  const tag = formData.get("tag") as string;
  const description = formData.get("description") as string;
  const avatar = formData.get("avatar") as File;

  const session = await auth();

  const organization = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId });

  if (!organization) {
    throw new Error("Organization not found or not accessible.");
  }

  const userIsEditor =
    session?.user &&
    organization.members.some(
      (member) => member.userId.equals(session.user?.id) && member.editor,
    );

  if (!userIsEditor) {
    throw new Error("You are not allowed to edit this organization.");
  }

  const update: Partial<Organization> = {
    name,
    description,
    tag,
  };

  if (avatar.size > 0) {
    console.log(avatar.type);
    if (!["image/jpeg", "image/png", "image/webp"].includes(avatar.type)) {
      throw new Error("Invalid file type");
    }
    if (avatar.size > 4000000) {
      throw new Error("File too large.");
    }

    const extension = avatar.name.split(".").pop();

    const blob = await put(`/orgs/${orgId}/avatar.${extension}`, avatar, {
      access: "public",
      addRandomSuffix: false,
    });

    update.image = blob.url;
  }

  await db.db().collection<Organization>("organizations").updateOne(
    { _id: orgId },
    {
      $set: update,
    },
  );

  revalidatePath(`/orgs/${orgId}/edit`);
  revalidatePath(`/orgs/${orgId}`);
}
