import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  getMyPositionSharing,
  setMyPositionSharing,
} from "@/lib/player-positions";
import {
  errorResponse,
  readJson,
  sessionUser,
  unauthorized,
} from "../position/errors";

/**
 * GET /api/me/position-sharing
 * Qui voit ma position (`MyPositionSharing`) : mon réglage, mes organisations
 * à cocher, mon nombre d'amis, et ce que je partage en ce moment.
 */
export async function GET() {
  const user = await sessionUser();
  if (!user) return unauthorized();
  return NextResponse.json(await getMyPositionSharing(new ObjectId(user.id)));
}

/**
 * PUT /api/me/position-sharing
 * Change le réglage : `{ enabled?, friends?, orgIds? }`. Le même pour l'app
 * et le site. Activer me déclare en jeu ; couper efface ma position.
 */
export async function PUT(request: NextRequest) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  try {
    return NextResponse.json(
      await setMyPositionSharing(
        new ObjectId(user.id),
        await readJson(request),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
