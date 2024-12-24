"use server";

import db from "@/lib/db";
import { Organization } from "@/app/orgs/page";
import { revalidatePath } from "next/cache";
import { ObjectId } from "bson";
import { auth } from "@/auth";

export async function handleRemoveMember(formData: FormData) {
  const session = await auth();

  const orgId = formData.get("orgId") as string;
  const memberId = formData.get("memberId") as string;

  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId });

  if (!org) {
    throw new Error("Organization not found");
  }

  if (
    !session?.user ||
    !org.members.some(
      (member) =>
        member.userId.equals(new ObjectId(session.user?.id)) && member.editor,
    )
  ) {
    throw new Error("Not allowed to manage organization");
  }

  if (
    !org.members.some((member) => member.userId.equals(new ObjectId(memberId)))
  ) {
    throw new Error("Member not found");
  }

  if (org.members.length === 1) {
    throw new Error(
      "Cannot remove the last member (delete organization instead).",
    );
  }

  await db
    .db()
    .collection<Organization>("organizations")
    .updateOne(
      { id: orgId },
      { $pull: { members: { userId: new ObjectId(memberId) } } },
    );

  revalidatePath(`/orgs/${orgId}`);
}
