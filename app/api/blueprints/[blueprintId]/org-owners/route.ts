import { NextRequest, NextResponse } from "next/server";
import { getUsersWithBlueprintInOrganization } from "@/lib/crafting";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { Organization } from "@/app/orgs/page";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blueprintId: string }> },
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { blueprintId } = await params;
  const orgId = request.nextUrl.searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
  }

  // Verify the requesting user is a member of this organization
  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne(
      {
        _id: orgId,
        "members.userId": new ObjectId(session.user.id),
      },
      { projection: { _id: 1 } },
    );

  if (!org) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await getUsersWithBlueprintInOrganization(orgId, blueprintId);

  return NextResponse.json(members);
}
