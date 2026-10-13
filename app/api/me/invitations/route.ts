import { NextResponse } from "next/server";
import { listInvitations } from "@/lib/share-targets";
import { markInvitationsSeen } from "@/lib/shares";
import { sessionUserId, unauthorized } from "@/app/api/shares/session";

/**
 * GET /api/me/invitations
 * The invitations the reader received — events and private places someone
 * shared with them —, newest first, and how many are still unseen: the bell
 * of the site and the in-game notification of the app.
 */
export async function GET() {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  return NextResponse.json(await listInvitations(userId));
}

/**
 * POST /api/me/invitations
 * Marks every invitation seen: the bell was opened.
 */
export async function POST() {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  await markInvitationsSeen(userId);
  return new NextResponse(null, { status: 204 });
}
