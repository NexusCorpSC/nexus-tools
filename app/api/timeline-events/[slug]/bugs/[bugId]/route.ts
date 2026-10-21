import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  deleteTimelineBug,
  setTimelineBugAffected,
  updateTimelineBug,
} from "@/lib/timeline-events";
import {
  invalidJson,
  isTimelineModerator,
  readJson,
  timelineErrorResponse,
  timelineSession,
  unauthenticated,
} from "@/lib/timeline-api";

type Params = { params: Promise<{ slug: string; bugId: string }> };

/**
 * PATCH /api/timeline-events/{slug}/bugs/{bugId}
 * Body : `{ affected: boolean }` — « je l'ai aussi », ouvert à tous ; ou les
 * champs du bug (statut, contournement…), par son auteur ou un modérateur.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { slug, bugId } = await params;
  const user = await timelineSession();
  if (!user) return unauthenticated();
  const body = await readJson(request);
  if (!body) return invalidJson();
  try {
    const bug =
      typeof body.affected === "boolean"
        ? await setTimelineBugAffected(slug, bugId, user.id, body.affected)
        : await updateTimelineBug(
            slug,
            bugId,
            { id: user.id, moderator: await isTimelineModerator() },
            body,
          );
    revalidatePath(`/timeline/${slug}`);
    return NextResponse.json(bug);
  } catch (error) {
    return timelineErrorResponse(error);
  }
}

/** DELETE /api/timeline-events/{slug}/bugs/{bugId} — par son auteur ou un modérateur. */
export async function DELETE(_request: Request, { params }: Params) {
  const { slug, bugId } = await params;
  const user = await timelineSession();
  if (!user) return unauthenticated();
  try {
    await deleteTimelineBug(slug, bugId, {
      id: user.id,
      moderator: await isTimelineModerator(),
    });
    revalidatePath(`/timeline/${slug}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return timelineErrorResponse(error);
  }
}
