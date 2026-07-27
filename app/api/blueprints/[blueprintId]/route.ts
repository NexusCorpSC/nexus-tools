import { NextResponse } from "next/server";
import { getBlueprintBySlug } from "@/lib/crafting";

type Params = { params: Promise<{ blueprintId: string }> };

/**
 * GET /api/blueprints/:slug
 * Returns the full details of a blueprint (recipe, statistics, obtention).
 * The route segment is named `blueprintId` to stay consistent with the
 * sibling `org-owners` route, but the value is the blueprint slug.
 */
export async function GET(_request: Request, { params }: Params) {
  const { blueprintId: slug } = await params;

  const blueprint = await getBlueprintBySlug(slug);

  if (!blueprint) {
    return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
  }

  return NextResponse.json(blueprint);
}
