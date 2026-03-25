"use server";

import db from "@/lib/db";
import { JoinRequest, Organization } from "@/app/orgs/page";
import { revalidatePath } from "next/cache";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { randomUUID } from "crypto";

export async function handleRemoveMember(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

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
      { _id: orgId },
      { $pull: { members: { userId: new ObjectId(memberId) } } },
    );

  revalidatePath(`/orgs/${orgId}`);
}

export async function generateJoinCode(orgId: string): Promise<string> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId });

  if (!org) throw new Error("Organization not found");

  if (
    !session?.user ||
    !org.members.some(
      (member) =>
        member.userId.equals(new ObjectId(session.user?.id)) && member.editor,
    )
  ) {
    throw new Error("Not allowed to manage organization");
  }

  if (org.joinCode) return org.joinCode;

  const code = randomUUID();
  await db
    .db()
    .collection<Organization>("organizations")
    .updateOne({ _id: orgId }, { $set: { joinCode: code } });

  return code;
}

export async function requestToJoin(
  orgId: string,
  code: string,
): Promise<void> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) throw new Error("Not authenticated");

  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId });

  if (!org || org.joinCode !== code) throw new Error("Invalid join link");

  if (
    org.members.some((member) =>
      member.userId.equals(new ObjectId(session.user!.id)),
    )
  ) {
    throw new Error("Already a member");
  }

  const existing = await db
    .db()
    .collection<JoinRequest>("joinRequests")
    .findOne({ orgId, userId: session.user.id });

  if (existing) return;

  await db.db().collection<JoinRequest>("joinRequests").insertOne({
    _id: new ObjectId(),
    orgId,
    userId: session.user.id,
    status: "PENDING",
    createdAt: new Date(),
  });

  revalidatePath(`/orgs/${orgId}/join/${code}`);
}

export async function handleJoinRequest(
  orgId: string,
  requestId: string,
  action: "accept" | "reject" | "block",
  role?: string,
): Promise<void> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId });

  if (!org) throw new Error("Organization not found");

  if (
    !session?.user ||
    !org.members.some(
      (member) =>
        member.userId.equals(new ObjectId(session.user?.id)) && member.editor,
    )
  ) {
    throw new Error("Not allowed to manage organization");
  }

  const request = await db
    .db()
    .collection<JoinRequest>("joinRequests")
    .findOne({ _id: new ObjectId(requestId) });

  if (!request) throw new Error("Request not found");

  if (action === "reject") {
    await db
      .db()
      .collection<JoinRequest>("joinRequests")
      .deleteOne({ _id: new ObjectId(requestId) });
  } else if (action === "block") {
    await db
      .db()
      .collection<JoinRequest>("joinRequests")
      .updateOne(
        { _id: new ObjectId(requestId) },
        { $set: { status: "BLOCKED" } },
      );
  } else if (action === "accept") {
    const memberRole = role?.trim() || "Membre";
    await db
      .db()
      .collection<Organization>("organizations")
      .updateOne(
        { _id: orgId },
        {
          $push: {
            members: {
              userId: new ObjectId(request.userId),
              rank: memberRole,
              editor: false,
            },
          },
        },
      );
    await db
      .db()
      .collection<JoinRequest>("joinRequests")
      .deleteOne({ _id: new ObjectId(requestId) });
  }

  revalidatePath(`/orgs/${orgId}`);
}
