import { NextResponse, NextRequest } from "next/server";
import { getBlueprintStatNames } from "@/lib/crafting";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query") ?? "";
  const names = await getBlueprintStatNames(query);
  return NextResponse.json(names);
}
