import { NextRequest, NextResponse } from "next/server";
import { getAppRequests } from "@/lib/player-requests";
import { sessionActor, unauthorized } from "@/app/api/requests/session";

/**
 * GET /api/me/requests?since=<ISO>
 * Pour l'app : mes demandes, mes offres et, depuis `since`, ce qui mérite une
 * notification (nouvelle offre, message, prix, étape, demande d'un ami ou de
 * l'orga). L'app renvoie `now` comme prochain `since`.
 */
export async function GET(request: NextRequest) {
  const actor = await sessionActor();
  if (!actor) return unauthorized();
  const raw = request.nextUrl.searchParams.get("since");
  const since = raw ? new Date(raw) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Invalid since" }, { status: 400 });
  }
  return NextResponse.json(await getAppRequests(actor.id, since?.toISOString()));
}
