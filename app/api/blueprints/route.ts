import { NextResponse, NextRequest } from "next/server";
import { searchBlueprints } from "@/lib/crafting";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query") || "";

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const blueprints = await searchBlueprints(query, {
    userId: session?.user?.id,
  });

  return NextResponse.json(blueprints);
}
