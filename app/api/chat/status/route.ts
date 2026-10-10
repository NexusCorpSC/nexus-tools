import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getChatStatus } from "@/lib/chat/access";

/**
 * GET /api/chat/status
 * L'accès du joueur à Nexus Chat et son budget du mois (`ChatStatus`).
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getChatStatus(new ObjectId(session.user.id)));
}
