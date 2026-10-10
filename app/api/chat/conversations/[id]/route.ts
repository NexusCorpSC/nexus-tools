import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import {
  cleanMessages,
  deleteConversation,
  getConversation,
  getLatestConversation,
  renameConversation,
} from "@/lib/chat/conversations";
import { CHAT_ID_PATTERN, CHAT_TITLE_MAX_LENGTH } from "@/types/chat";

type Params = { params: Promise<{ id: string }> };

async function userId(): Promise<ObjectId | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ? new ObjectId(session.user.id) : null;
}

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

/**
 * GET /api/chat/conversations/:id
 * Une conversation et ses messages. `latest` désigne la plus récente : c'est
 * celle que l'overlay de l'app reprend (`null` s'il n'y en a pas encore).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const owner = await userId();
  if (!owner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (id !== "latest" && !CHAT_ID_PATTERN.test(id)) return notFound();
  const conversation =
    id === "latest"
      ? await getLatestConversation(owner)
      : await getConversation(owner, id);
  if (!conversation) {
    return id === "latest" ? NextResponse.json(null) : notFound();
  }
  return NextResponse.json({
    id: conversation._id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    messages: cleanMessages(conversation.messages),
  });
}

/**
 * PATCH /api/chat/conversations/:id
 * Renomme une conversation. Body: { title }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const owner = await userId();
  if (!owner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!CHAT_ID_PATTERN.test(id)) return notFound();
  let title: unknown;
  try {
    title = ((await request.json()) as { title?: unknown })?.title;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof title !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const clean = title
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_TITLE_MAX_LENGTH);
  if (!clean) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!(await renameConversation(owner, id, clean))) return notFound();
  return NextResponse.json({ id, title: clean });
}

/**
 * DELETE /api/chat/conversations/:id
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const owner = await userId();
  if (!owner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!CHAT_ID_PATTERN.test(id)) return notFound();
  if (!(await deleteConversation(owner, id))) return notFound();
  return new NextResponse(null, { status: 204 });
}
