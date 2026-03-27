import { NextResponse, NextRequest } from "next/server";
import { searchBlueprints, filterBlueprints } from "@/lib/crafting";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query") || "";
  const fuzzy = searchParams.get("fuzzy") === "true";
  const category = searchParams.get("category") || undefined;
  const subcategory = searchParams.get("subcategory") || undefined;
  const ownedParam = searchParams.get("owned");
  const materialsParam = searchParams.get("materials");
  const materials = materialsParam
    ? materialsParam.split(",").filter(Boolean)
    : undefined;
  const owned =
    ownedParam === "true" ? true : ownedParam === "false" ? false : undefined;

  const limitParam = searchParams.get("limit");
  const pageParam = searchParams.get("page");
  const limit = limitParam ? Math.max(1, Math.min(100, parseInt(limitParam, 10))) : 24;
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Fuzzy search is used by the quick-search combobox on detail pages
  if (fuzzy) {
    const blueprints = await searchBlueprints(query, {
      userId: session?.user?.id,
      fuzzy: true,
    });
    return NextResponse.json(blueprints);
  }

  // For the browse/filter page use filterBlueprints
  const { blueprints, total } = await filterBlueprints({
    query: query || undefined,
    category,
    subcategory,
    owned,
    materials,
    userId: session?.user?.id,
    limit,
    page,
  });

  return NextResponse.json({
    blueprints,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
