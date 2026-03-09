import { NextResponse, NextRequest } from "next/server";
import { searchBlueprints } from "@/lib/crafting";
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query") || "";

  const session = await auth();

  const blueprints = await searchBlueprints(query, {
    userId: session?.user?.id,
  });

  return NextResponse.json(blueprints);
}
