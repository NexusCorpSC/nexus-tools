import { NextResponse } from "next/server";
import { sessionUser } from "@/app/api/lieux/prives/errors";
import { getPlanetMap, getPlanetMapPoints } from "@/lib/planet-maps";

/**
 * GET /api/lieux/<slug>/carte
 * La carte de surface d'une planète ou d'une lune : son manifeste, l'adresse
 * de ses tuiles, et ce qui s'y pose — les lieux du catalogue et, pour qui est
 * connecté, ses lieux privés et ses marqueurs. 404 quand le corps n'a pas de
 * carte. Ce que l'app affiche dans la fiche du corps et dans l'overlay.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const map = await getPlanetMap(slug);
  if (!map) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  const user = await sessionUser();
  const points = await getPlanetMapPoints(slug, map.manifest.radius, user?.id);
  return NextResponse.json({ ...map, points });
}
