import { NextRequest, NextResponse } from "next/server";
import { searchShopItems } from "@/lib/shop-items";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("q") || "";

  const items = await searchShopItems(search);

  return NextResponse.json(items);
}
