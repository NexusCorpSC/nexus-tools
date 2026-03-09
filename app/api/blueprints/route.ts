import { NextResponse, NextRequest } from "next/server";
import { searchBlueprints } from "@/lib/crafting";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query") || "";

  const blueprints = await searchBlueprints(query);

  return NextResponse.json(blueprints);
}
