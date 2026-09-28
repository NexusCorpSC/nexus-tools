import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getMyFriendCode, getOrCreateFriendCode } from "@/lib/friends";
import type { MyFriendCode } from "@/types/friends";

/**
 * GET /api/me/friends/code
 * The reader's pending friend code, `{ code: null }` when they have none — never
 * asked for, or already used.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: MyFriendCode = {
    code: await getMyFriendCode(new ObjectId(session.user.id)),
  };
  return NextResponse.json(body);
}

/**
 * POST /api/me/friends/code
 * The reader's pending friend code, created if they have none. Asking again
 * before it is used answers the same one.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: MyFriendCode = {
    code: await getOrCreateFriendCode(new ObjectId(session.user.id)),
  };
  return NextResponse.json(body);
}
