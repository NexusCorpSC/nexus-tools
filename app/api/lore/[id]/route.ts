import { NextResponse } from "next/server";
import { getLoreArticle } from "@/lib/lore";

/** Un article de la Galactapedia, par son identifiant RSI ou son slug. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const article = await getLoreArticle(id);
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }
  return NextResponse.json(article);
}
