import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { visiblePlayers } from "@/lib/player-positions";
import { sessionUser, unauthorized } from "@/app/api/me/position/errors";

/**
 * GET /api/starmap/joueurs
 * Les joueurs en jeu dont je vois la position (`PlayerInGame[]`), moi compris
 * si je partage : mes amis, et les membres de mes organisations qui les ont
 * cochées. La Star Map la relit régulièrement ; le NPS de l'app aussi.
 */
export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();
  return NextResponse.json(
    { players: await visiblePlayers(new ObjectId(user.id)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
