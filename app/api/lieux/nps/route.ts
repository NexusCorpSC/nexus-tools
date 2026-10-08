import { NextResponse } from "next/server";
import { getNpsData } from "@/lib/places";

/**
 * GET /api/lieux/nps
 * Pour le NPS de l'app : les corps célestes (centre, rayon, rotation) et les
 * lieux dont la position a été relevée. Voir `NpsResponse`.
 */
export async function GET() {
  return NextResponse.json(await getNpsData());
}
