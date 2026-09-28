import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { addFriendByCode, FriendError, listFriends } from "@/lib/friends";
import type { FriendList } from "@/types/friends";

/**
 * GET /api/me/friends
 * The reader's friends: those playing first — with what they declared — then
 * the others by name.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: FriendList = {
    friends: await listFriends(new ObjectId(session.user.id)),
  };
  return NextResponse.json(body);
}

/**
 * POST /api/me/friends
 * Body: `{ code }`, a friend code someone handed the reader ("K7QD-92PX",
 * case and dash optional). Both become friends and the code is used up;
 * answers the new friend (201). Refusals answer `{ error }` — see
 * `FriendErrorCode`.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const friend = await addFriendByCode(
      new ObjectId(session.user.id),
      (body as { code?: unknown } | null)?.code,
    );
    return NextResponse.json(friend, { status: 201 });
  } catch (error) {
    if (error instanceof FriendError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }
    throw error;
  }
}
