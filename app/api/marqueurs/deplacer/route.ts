import { NextRequest, NextResponse } from "next/server";
import { moveMarkers } from "@/lib/markers";
import {
  errorResponse,
  invalidInput,
  readJson,
  sessionUser,
  unauthorized,
} from "../errors";

/**
 * POST /api/marqueurs/deplacer `{ ids, collectionId }` : range plusieurs de
 * ses marqueurs dans une de ses collections, ou hors de toute (`null`).
 */
export async function POST(request: NextRequest) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const body = await readJson<{ ids?: unknown; collectionId?: unknown }>(
    request,
  );
  if (!body) return invalidInput();
  try {
    const moved = await moveMarkers(user.id, body.ids, body.collectionId);
    return NextResponse.json({ moved });
  } catch (error) {
    return errorResponse(error);
  }
}
