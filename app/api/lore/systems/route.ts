import { NextResponse } from "next/server";
import { listStarSystems } from "@/lib/lore";

/** Les systèmes de la starmap de RSI. */
export async function GET() {
  return NextResponse.json(await listStarSystems());
}
