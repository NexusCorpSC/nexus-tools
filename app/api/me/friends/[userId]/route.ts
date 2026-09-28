import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { removeFriend } from "@/lib/friends";

type Params = { params: Promise<{ userId: string }> };

/**
 * DELETE /api/me/friends/:userId
 * Ends the friendship, for both sides. 404 when there was none.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const removed = await removeFriend(new ObjectId(session.user.id), userId);

  if (!removed) {
    return NextResponse.json({ error: "Friend not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
