import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getStanding } from "@/lib/contributions";
import { timelineSession } from "@/lib/timeline-api";
import { grantUpload } from "@/lib/upload-grants";

/**
 * La bannière d'un évènement proposé ou corrigé. Le nom est libre et Vercel y
 * ajoute un suffixe : personne ne remplace une bannière publiée en devinant
 * son chemin, et la contribution vérifie que l'image vient bien d'ici.
 */
const BANNER = /^timeline\/[A-Za-z0-9_-]{1,60}\.(?:jpe?g|png|webp)$/i;

/** POST /api/timeline-events/upload — le jeton d'envoi d'une bannière (`@vercel/blob/client`). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;
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
        // Le plafond horaire des images de lieux, bannières comprises.
        await grantUpload(user.id);
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
