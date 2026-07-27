import { NextResponse } from "next/server";
import { getFactions } from "@/lib/reputations";

/**
 * GET /api/reps/factions
 * Returns the reputation factions configuration: standings, careers and
 * their levels. Public — the configuration is the same for every player.
 */
export async function GET() {
  const factions = await getFactions();

  return NextResponse.json({ factions });
}
