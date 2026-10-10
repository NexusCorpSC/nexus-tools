import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getChatStatus, requestChatAccess } from "@/lib/chat/access";

/**
 * POST /api/chat/access
 * Le joueur demande l'accès à Nexus Chat ; l'admin l'ouvre depuis
 * `/admin/chat`. Rend le nouvel état (`ChatStatus`).
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);
  await requestChatAccess(userId);
  revalidatePath("/admin/chat");
  return NextResponse.json(await getChatStatus(userId));
}
