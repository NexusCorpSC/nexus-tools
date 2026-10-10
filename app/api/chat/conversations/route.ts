import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { listConversations } from "@/lib/chat/conversations";

/**
 * GET /api/chat/conversations
 * Les conversations du joueur, de la plus récente (`ChatConversationSummary[]`).
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    await listConversations(new ObjectId(session.user.id)),
  );
}
