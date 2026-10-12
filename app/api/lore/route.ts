import { NextResponse, type NextRequest } from "next/server";
import { browseLore, listLoreCategories } from "@/lib/lore";

/**
 * Une page de la Galactapedia : `?q=` cherche par pertinence, `?category=`
 * restreint à une catégorie, `?page=` à partir de 1. Les catégories (avec
 * leur nombre d'articles) sont jointes, pour le filtre.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const [page, categories] = await Promise.all([
    browseLore({
      query: params.get("q") ?? undefined,
      category: params.get("category") ?? undefined,
      page: Number(params.get("page") ?? 1),
    }),
    listLoreCategories(),
  ]);
  return NextResponse.json({ ...page, categories });
}
