import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { getStanding } from "@/lib/contributions";
import { timelineSession } from "@/lib/timeline-api";

/** Comme les images de lieux : un plafond par heure, galeries et bannières confondues. */
const UPLOADS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

const uploadGrants = () =>
  db.db().collection<{ userId: ObjectId; at: Date }>("uploadGrants");

/**
 * La bannière d'un évènement proposé ou corrigé. Le nom est libre et Vercel y
 * ajoute un suffixe : personne ne remplace une bannière publiée en devinant
 * son chemin, et la contribution vérifie que l'image vient bien d'ici.
 */
const BANNER = /^timeline\/[A-Za-z0-9_-]{1,60}\.(?:jpe?g|png|webp)$/i;

/** POST /api/timeline-events/upload — le jeton d'envoi d'une bannière (`@vercel/blob/client`). */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!BANNER.test(pathname)) throw new Error("Invalid pathname.");
        const user = await timelineSession();
        if (!user) throw new Error("Unauthorized");
        const standing = await getStanding(user.id);
        if (standing.suspendedUntil) {
          throw new Error("Contributions suspended.");
        }
        const now = new Date();
        const recent = await uploadGrants().countDocuments({
          userId: user.id,
          at: { $gte: new Date(now.getTime() - HOUR_MS) },
        });
        if (recent >= UPLOADS_PER_HOUR) {
          throw new Error("Too many uploads, try again later.");
        }
        await uploadGrants().insertOne({ userId: user.id, at: now });
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 8_000_000,
          addRandomSuffix: true,
          allowOverwrite: false,
        };
      },
      onUploadCompleted: async () => {
        // L'adresse revient au formulaire, qui l'envoie avec la proposition.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
