import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { shares } from "@/lib/shares";
import { sessionUserId, unauthorized } from "@/app/api/shares/session";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/me/invitations/:id
 * Declines an invitation: the reader no longer sees that event or place.
 * Their registration to an event stays, like any withdrawn member's would.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  const removed = await shares().deleteOne({ _id: new ObjectId(id), userId });
  if (removed.deletedCount === 0) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
