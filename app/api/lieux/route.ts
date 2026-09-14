import { NextRequest, NextResponse } from "next/server";
import { filterPlaces } from "@/lib/places";
import {
  MAX_PLACE_PAGE_SIZE,
  PLACE_PAGE_SIZE,
  type PlaceListResponse,
} from "@/types/places";

/**
 * GET /api/lieux
 * Parcourt le catalogue des lieux, lieux imbriqués compris.
 *
 * Paramètres : `query`, `type`, `system`, `body`, `service`, `parent` (les
 * lieux contenus directement), `under` (tout un sous-arbre), `sort`,
 * `limit` (1-100) et `page`.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const limitParam = parseInt(sp.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(MAX_PLACE_PAGE_SIZE, limitParam))
    : PLACE_PAGE_SIZE;

  const pageParam = parseInt(sp.get("page") ?? "", 10);
  const page = Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1;

  const { places, total } = await filterPlaces({
    query: sp.get("query") ?? undefined,
    type: sp.get("type") ?? undefined,
    system: sp.get("system") ?? undefined,
    body: sp.get("body") ?? undefined,
    service: sp.get("service") ?? undefined,
    parent: sp.get("parent") ?? undefined,
    under: sp.get("under") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    limit,
    page,
  });

  const response: PlaceListResponse = {
    places,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };

  return NextResponse.json(response);
}
