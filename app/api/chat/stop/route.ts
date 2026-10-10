import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { requestChatStop } from "@/lib/chat/lock";

/**
 * POST /api/chat/stop
 * « Arrêter » : la réponse en cours du joueur s'arrête après l'étape en
 * cours, et n'est pas facturée au-delà. Couper le flux côté client ne
 * suffit pas : le serveur va au bout de la réponse pour l'enregistrer.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await requestChatStop(new ObjectId(session.user.id));
  return new NextResponse(null, { status: 204 });
}
