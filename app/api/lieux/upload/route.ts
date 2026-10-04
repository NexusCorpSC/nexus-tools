import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { hasPermission } from "@/lib/permissions";
import { getStanding } from "@/lib/contributions";
import { getPlaceBySlug } from "@/lib/places";
import { DIRECT_MEDIA_LEVEL, MAX_PENDING_RECRUIT } from "@/types/contributions";
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import db from "@/lib/db";

/**
 * Ce qu'un joueur sans droit d'édition peut téléverser par heure, images de
 * galerie et de plans confondues. Un relevé envoie son aperçu à chaque
 * enregistrement : la limite laisse dessiner, pas remplir le stockage.
 */
const UPLOADS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

const uploadGrants = () =>
  db.db().collection<{ userId: ObjectId; at: Date }>("uploadGrants");

/** La vignette d'un lieu. */
const COVER = /^lieux\/[a-z0-9-]{1,120}\/image\.[a-z0-9]{1,6}$/i;

/** Le fond d'un plan, rangé sous l'identifiant de ce plan. */
const PLAN =
  /^lieux\/([a-z0-9-]{1,120})\/plans\/[A-Za-z0-9_-]{6,40}\.[a-z0-9]{1,6}$/i;

/**
 * Une image de la galerie, envoyée par n'importe quel joueur connecté. Le nom
 * est libre et Vercel y ajoute un suffixe aléatoire : deux joueurs qui
 * envoient `hall.png` ne s'écrasent pas, et personne ne remplace une image
 * déjà publiée en devinant son chemin.
 */
const MEDIA =
  /^lieux\/([a-z0-9-]{1,120})\/media\/[A-Za-z0-9_-]{1,60}\.(?:jpe?g|png|webp)$/i;

/**
 * Le chemin dans le blob est une fonction du slug et de l'identifiant du plan,
 * sans suffixe aléatoire : renvoyer une image la remplace en place. Supprimer
 * un plan laisse donc la sienne orpheline — c'est le même compromis que pour
 * les objets, assumé faute de collection de médias et de ménage associé.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const media = MEDIA.exec(pathname);
        const plan = PLAN.exec(pathname);
        const editor = await hasPermission(PLACES_EDIT_PERMISSION);
        // Un contributeur envoie aussi les images d'un plan qu'il propose —
        // fond, calque, aperçu rendu —, mais jamais à une adresse déjà prise :
        // le suffixe aléatoire l'empêche de remplacer un plan publié.
        const contributed = media ?? (editor ? null : plan);
        if (contributed) {
          const session = await auth.api.getSession({
            headers: await headers(),
          });
          if (!session?.user) throw new Error("Unauthorized");

          // Ce que l'envoi refuserait de toute façon, on ne le stocke pas :
          // les images téléversées puis refusées resteraient orphelines.
          if (!(await getPlaceBySlug(contributed[1]))) {
            throw new Error("Unknown place.");
          }
          const userId = new ObjectId(session.user.id);
          const standing = await getStanding(userId);
          if (standing.suspendedUntil) {
            throw new Error("Contributions suspended.");
          }
          // Le plafond ne vaut que pour la galerie : un plan en cours de
          // relevé envoie son aperçu à chaque enregistrement, et c'est la
          // contribution qui le porte qui compte dans le plafond.
          if (
            media &&
            standing.level < DIRECT_MEDIA_LEVEL &&
            standing.pending >= MAX_PENDING_RECRUIT
          ) {
            throw new Error("Too many pending contributions.");
          }
          const now = new Date();
          const recent = await uploadGrants().countDocuments({
            userId,
            at: { $gte: new Date(now.getTime() - HOUR_MS) },
          });
          if (recent >= UPLOADS_PER_HOUR) {
            throw new Error("Too many uploads, try again later.");
          }
          await uploadGrants().insertOne({ userId, at: now });

          return {
            allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
            maximumSizeInBytes: 12_000_000,
            addRandomSuffix: true,
            allowOverwrite: false,
          };
        }

        if (!editor) throw new Error("Unauthorized");

        if (!COVER.test(pathname) && !PLAN.test(pathname)) {
          throw new Error("Invalid pathname.");
        }

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          // Un plan est plus lourd qu'une vignette : c'est une capture.
          maximumSizeInBytes: 12_000_000,
          addRandomSuffix: false,
          allowOverwrite: true,
        };
      },
      onUploadCompleted: async () => {
        // L'URL est renvoyée au client, qui la range dans le plan qu'il édite.
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
