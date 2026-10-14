import { NextResponse } from "next/server";
import { PlayerPositionError } from "@/lib/player-positions";

export { sessionUser, unauthorized } from "@/app/api/lieux/prives/errors";

/** Les erreurs connues reviennent par leur code, que les formulaires traduisent. */
export function errorResponse(error: unknown) {
  if (error instanceof PlayerPositionError) {
    return NextResponse.json(
      { error: error.code, detail: error.message },
      { status: error.status },
    );
  }
  throw error;
}

/** Le corps JSON d'une requête, ou `null` s'il ne se lit pas. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
