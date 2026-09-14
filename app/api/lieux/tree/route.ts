import { NextRequest, NextResponse } from "next/server";
import { listPlaceTree } from "@/lib/places";

/**
 * GET /api/lieux/tree
 * Les mêmes filtres que `/api/lieux`, mais la réponse porte aussi les lieux
 * qui contiennent un résultat, marqués `matched: false` : la vue arborescente
 * les affiche estompés, en contexte.
 *
 * La liste est plate et déjà dans l'ordre de parcours de l'arbre — c'est le
 * tri sur `path` qui s'en charge, côté base.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  return NextResponse.json(
    await listPlaceTree({
      query: sp.get("query") ?? undefined,
      type: sp.get("type") ?? undefined,
      system: sp.get("system") ?? undefined,
      body: sp.get("body") ?? undefined,
      service: sp.get("service") ?? undefined,
    }),
  );
}
