import { NextResponse } from "next/server";
import { getItemFacets } from "@/lib/items";

/**
 * GET /api/items/facets
 * Values available in the filters and in the admin form: categories with
 * their subcategories, manufacturers, variant groups and sets.
 */
export async function GET() {
  return NextResponse.json(await getItemFacets());
}
