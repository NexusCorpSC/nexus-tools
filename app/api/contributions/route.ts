import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { ContributionError, submitPlaceMedia } from "@/lib/contributions";

/**
 * POST /api/contributions
 * Body : `{ kind: "media", placeSlug, images: [{ url, width, height, caption?,
 * credit? }], gameVersion? }`. Les images sont téléversées avant, par
 * `/api/lieux/upload`, sous `lieux/<slug>/media/`.
 *
 * Répond `{ contribution, standing }` : la contribution est `published` quand
 * le niveau de l'auteur la publie directement, `pending` sinon. Refus :
 * `{ error }` — voir `ContributionErrorCode`.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.kind !== "media" || typeof body.placeSlug !== "string") {
    return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await submitPlaceMedia(
        { id: new ObjectId(session.user.id), name: session.user.name },
        body.placeSlug,
        body.images,
        body.gameVersion,
      ),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ContributionError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
}
