import { NextResponse } from "next/server";
import { getItemDetails } from "@/lib/items";

/**
 * GET /api/items/[slug]
 * One in-game object with its blueprints, its variants and its set.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const item = await getItemDetails(slug);

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}
