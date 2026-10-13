import { NextRequest, NextResponse } from "next/server";
import { deleteMarker, MarkerError } from "@/lib/markers";
import {
  countOwnedPrivatePlaces,
  createPrivatePlace,
  listPrivatePlaces,
  myOrgOptions,
} from "@/lib/private-places";
import type {
  PrivatePlaceInput,
  PrivatePlaceListResponse,
} from "@/types/private-places";
import { errorResponse, sessionUser, unauthorized } from "./errors";

/**
 * GET /api/lieux/prives
 * Les lieux privés que le joueur voit : les siens, et ceux de ses
 * organisations. Mêmes filtres que `/api/lieux` (`query`, `type`, `system`,
 * `body`), plus `positioned=1` pour ceux qui ont une position. Site et app.
 */
export async function GET(request: NextRequest) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const params = request.nextUrl.searchParams;
  const [places, orgs, owned] = await Promise.all([
    listPrivatePlaces(user.id, {
      query: params.get("query") ?? undefined,
      type: params.get("type") ?? undefined,
      system: params.get("system") ?? undefined,
      body: params.get("body") ?? undefined,
      positioned: params.get("positioned") === "1",
    }),
    myOrgOptions(user.id),
    countOwnedPrivatePlaces(user.id),
  ]);
  return NextResponse.json({
    places,
    orgs,
    owned,
  } satisfies PrivatePlaceListResponse);
}

/**
 * POST /api/lieux/prives
 * Crée un lieu privé (`PrivatePlaceInput`). `fromLocationId` complète un
 * emplacement personnel de l'inventaire plutôt que d'en créer un ;
 * `fromMarkerId` est le marqueur qui devient ce lieu, supprimé ensuite.
 */
export async function POST(request: NextRequest) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  let body: PrivatePlaceInput & {
    fromLocationId?: unknown;
    fromMarkerId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }
  try {
    const slug = await createPrivatePlace(
      user.id,
      body,
      typeof body.fromLocationId === "string" ? body.fromLocationId : undefined,
    );
    if (typeof body.fromMarkerId === "string") {
      // Le lieu existe : un marqueur déjà parti ne doit pas le faire échouer.
      await deleteMarker(user.id, body.fromMarkerId).catch((error) => {
        if (!(error instanceof MarkerError)) throw error;
      });
    }
    return NextResponse.json({ slug }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
