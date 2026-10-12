import { NextResponse } from "next/server";
import { getStarSystem } from "@/lib/lore";

/** Un système de la starmap : description, points de saut et corps. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const system = await getStarSystem(decodeURIComponent(code));
  if (!system) {
    return NextResponse.json({ error: "System not found" }, { status: 404 });
  }
  return NextResponse.json(system);
}
