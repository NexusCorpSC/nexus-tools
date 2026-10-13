import { NextRequest, NextResponse } from "next/server";
import { createMarker, listMarkers } from "@/lib/markers";
import type { MarkerInput } from "@/types/markers";
import {
  errorResponse,
  invalidInput,
  readJson,
  sessionUser,
  unauthorized,
} from "./errors";

/**
 * GET /api/marqueurs
 * Les marqueurs que le joueur voit (les siens, et ceux des collections que
 * ses organisations partagent), ses collections et ses organisations. Filtres :
 * `collection` (id, ou `none`), `kind`, `body`, `system`, `query`. Site et app.
 */
export async function GET(request: NextRequest) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const params = request.nextUrl.searchParams;
  return NextResponse.json(
    await listMarkers(user.id, {
      collection: params.get("collection") ?? undefined,
      kind: params.get("kind") ?? undefined,
      body: params.get("body") ?? undefined,
      system: params.get("system") ?? undefined,
      query: params.get("query") ?? undefined,
    }),
  );
}

/** POST /api/marqueurs : crée un marqueur (`MarkerInput`). */
export async function POST(request: NextRequest) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const body = await readJson<MarkerInput>(request);
  if (!body) return invalidInput();
  try {
    const id = await createMarker(user.id, body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
