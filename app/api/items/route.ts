import { NextRequest, NextResponse } from "next/server";
import { filterItems } from "@/lib/items";
import {
  ITEM_PAGE_SIZE,
  MAX_ITEM_PAGE_SIZE,
  type ItemListResponse,
} from "@/types/items";

/**
 * GET /api/items
 * Browses every in-game object (items, weapons, vehicles).
 *
 * Query params: `query`, `kind`, `category`, `subcategory`, `manufacturer`,
 * `set`, `variantGroup`, `limit` (1-100) and `page`.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const limitParam = parseInt(sp.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(MAX_ITEM_PAGE_SIZE, limitParam))
    : ITEM_PAGE_SIZE;

  const pageParam = parseInt(sp.get("page") ?? "", 10);
  const page = Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1;

  const { items, total } = await filterItems({
    query: sp.get("query") ?? undefined,
    kind: sp.get("kind") ?? undefined,
    category: sp.get("category") ?? undefined,
    subcategory: sp.get("subcategory") ?? undefined,
    manufacturer: sp.get("manufacturer") ?? undefined,
    setId: sp.get("set") ?? undefined,
    variantGroup: sp.get("variantGroup") ?? undefined,
    limit,
    page,
  });

  const response: ItemListResponse = {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };

  return NextResponse.json(response);
}
