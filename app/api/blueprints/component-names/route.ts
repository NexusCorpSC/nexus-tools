import { NextResponse, NextRequest } from "next/server";
import { getBlueprintComponentNames } from "@/lib/crafting";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query") ?? "";
  const names = await getBlueprintComponentNames(query);
  return NextResponse.json(names);
}
