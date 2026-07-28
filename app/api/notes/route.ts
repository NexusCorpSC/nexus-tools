import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getUserNote, saveUserNote } from "@/lib/notes";
import { NOTE_CONTENT_MAX_LENGTH } from "@/types/notes";

/**
 * GET /api/notes
 * Returns the scratch pad of the authenticated user.
 * Mirrors `getNoteAction`, which server components use, so API clients
 * (desktop app) can read the same note.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const note = await getUserNote(new ObjectId(session.user.id));

  return NextResponse.json(note);
}

/**
 * PUT /api/notes
 * Replaces the scratch pad of the authenticated user.
 *
 * Body: { content }
 */
export async function PUT(request: NextRequest) {
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

  const content = (body as { content?: unknown })?.content;

  if (typeof content !== "string") {
    return NextResponse.json(
      { error: "`content` must be a string" },
      { status: 400 },
    );
  }

  if (content.length > NOTE_CONTENT_MAX_LENGTH) {
    return NextResponse.json(
      { error: `\`content\` exceeds ${NOTE_CONTENT_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const note = await saveUserNote(new ObjectId(session.user.id), content);

  // `saveNoteAction` does the same: without it, a note written from the desktop
  // app leaves an already-visited /notes serving its cached copy.
  revalidatePath("/notes");

  return NextResponse.json(note);
}
