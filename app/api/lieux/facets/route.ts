import { NextResponse } from "next/server";
import { getPlaceFacets } from "@/lib/places";

/** GET /api/lieux/facets — de quoi remplir les listes déroulantes du filtre. */
export async function GET() {
  return NextResponse.json(await getPlaceFacets());
}
