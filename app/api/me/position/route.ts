import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { clearMyPosition, reportMyPosition } from "@/lib/player-positions";
import { errorResponse, readJson, sessionUser, unauthorized } from "./errors";

/**
 * PUT /api/me/position
 * Partage ma position du moment (`PositionInput` : `systemSlug` dans
 * l'espace, `position`, `source`). Il faut avoir activé le partage (409
 * `notSharing` sinon) ; ne pas être en jeu me déclare en jeu. Le NPS de l'app
 * l'appelle à chaque relevé, le site depuis le champ « Ma position ».
 */
export async function PUT(request: NextRequest) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  try {
    return NextResponse.json(
      await reportMyPosition(new ObjectId(user.id), await readJson(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/me/position : efface ma position, sans couper le partage. */
export async function DELETE() {
  const user = await sessionUser();
  if (!user) return unauthorized();
  await clearMyPosition(new ObjectId(user.id));
  return new NextResponse(null, { status: 204 });
}
