import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { del, put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { ContributionError } from "@/lib/contribution-store";
import { getStanding, submitPlaceMedia } from "@/lib/contributions";
import { getPlaceBySlug } from "@/lib/places";
import { DIRECT_MEDIA_LEVEL, MAX_PENDING_RECRUIT } from "@/types/contributions";

/**
 * Sous la limite de corps d'une fonction Vercel (4,5 Mo) : au-delà, la
 * requête n'atteindrait pas ce code.
 */
const MAX_BYTES = 4_000_000;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Le même plafond horaire que `/api/lieux/upload`, sur la même collection. */
const UPLOADS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

const uploadGrants = () =>
  db.db().collection<{ userId: ObjectId; at: Date }>("uploadGrants");

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * POST /api/lieux/{slug}/media
 * Multipart : `file` (JPEG, PNG ou WebP, 4 Mo au plus), `width`, `height`,
 * `caption?`, `credit?`, `gameVersion?`. Pour l'app, qui n'a pas le client
 * Blob : le site stocke l'image puis l'envoie comme une contribution de
 * galerie, publiée d'emblée à partir du niveau 2, relue d'abord en dessous.
 *
 * Répond 201 `{ contribution, standing }`, ou `{ error }`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return fail("unauthenticated", 401);
  const author = { id: new ObjectId(session.user.id), name: session.user.name };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("invalidMedia", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("noMedia", 400);
  const extension = TYPES[file.type];
  if (!extension) return fail("invalidMedia", 400);
  if (file.size > MAX_BYTES) return fail("fileTooLarge", 413);

  // Ce que l'envoi refuserait de toute façon, on ne le stocke pas : l'image
  // resterait orpheline.
  if (!(await getPlaceBySlug(slug))) return fail("placeNotFound", 404);
  const standing = await getStanding(author.id);
  if (standing.suspendedUntil) return fail("suspended", 403);
  if (
    standing.level < DIRECT_MEDIA_LEVEL &&
    standing.pending >= MAX_PENDING_RECRUIT
  ) {
    return fail("tooManyPending", 429);
  }
  const now = new Date();
  const recent = await uploadGrants().countDocuments({
    userId: author.id,
    at: { $gte: new Date(now.getTime() - HOUR_MS) },
  });
  if (recent >= UPLOADS_PER_HOUR) return fail("tooManyUploads", 429);
  await uploadGrants().insertOne({ userId: author.id, at: now });

  let url: string;
  try {
    const blob = await put(`lieux/${slug}/media/capture.${extension}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    url = blob.url;
  } catch (error) {
    console.error("Téléversement d'une image de lieu impossible", error);
    return fail("uploadFailed", 502);
  }

  try {
    const result = await submitPlaceMedia(
      author,
      slug,
      [
        {
          url,
          width: field(form, "width"),
          height: field(form, "height"),
          caption: field(form, "caption"),
          credit: field(form, "credit"),
        },
      ],
      field(form, "gameVersion"),
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    await del(url).catch(() => undefined);
    if (error instanceof ContributionError) {
      return fail(error.code, error.status);
    }
    throw error;
  }
}
