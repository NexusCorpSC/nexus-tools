import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/permissions";
import { PLACES_EDIT_PERMISSION } from "@/types/places";

/** La vignette d'un lieu. */
const COVER = /^lieux\/[a-z0-9-]{1,120}\/image\.[a-z0-9]{1,6}$/i;

/** Le fond d'un plan, rangé sous l'identifiant de ce plan. */
const PLAN =
  /^lieux\/[a-z0-9-]{1,120}\/plans\/[A-Za-z0-9_-]{6,40}\.[a-z0-9]{1,6}$/i;

/**
 * Une image de la galerie, envoyée par n'importe quel joueur connecté. Le nom
 * est libre et Vercel y ajoute un suffixe aléatoire : deux joueurs qui
 * envoient `hall.png` ne s'écrasent pas, et personne ne remplace une image
 * déjà publiée en devinant son chemin.
 */
const MEDIA =
  /^lieux\/[a-z0-9-]{1,120}\/media\/[A-Za-z0-9_-]{1,60}\.(?:jpe?g|png|webp)$/i;

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
        if (MEDIA.test(pathname)) {
          const session = await auth.api.getSession({
            headers: await headers(),
          });
          if (!session?.user) throw new Error("Unauthorized");

          // La contribution vérifie ensuite que le lieu existe et que l'image
          // lui est bien destinée ; ici, on ne fait que limiter ce qu'on
          // accepte de stocker.
          return {
            allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
            maximumSizeInBytes: 12_000_000,
            addRandomSuffix: true,
            allowOverwrite: false,
          };
        }

        await auth.api.getSession({ headers: await headers() });
        await requirePermission(PLACES_EDIT_PERMISSION);

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
