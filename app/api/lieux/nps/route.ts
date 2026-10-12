import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getNpsData } from "@/lib/places";
import { listPrivatePlaces } from "@/lib/private-places";
import type { NpsPlace } from "@/types/places";

/**
 * GET /api/lieux/nps
 * Pour le NPS de l'app : les corps célestes (centre, rayon, rotation) et les
 * lieux dont la position a été relevée. Voir `NpsResponse`. Connecté, le
 * joueur y trouve aussi ses lieux privés relevés et ceux de ses
 * organisations, marqués `private`.
 */
export async function GET() {
  const [data, session] = await Promise.all([
    getNpsData(),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!session?.user) return NextResponse.json(data);

  const own = await listPrivatePlaces(session.user.id, { positioned: true });
  const privatePlaces: NpsPlace[] = own.map((place) => {
    const entry: NpsPlace = {
      slug: place.slug,
      name: place.name,
      type: place.type,
      position: place.position!,
      private: place.org ? { org: place.org.name } : {},
    };
    if (place.systemSlug) entry.systemSlug = place.systemSlug;
    if (place.systemName) entry.systemName = place.systemName;
    if (place.bodyName) entry.bodyName = place.bodyName;
    if (place.parentName) entry.parentName = place.parentName;
    return entry;
  });
  return NextResponse.json({
    ...data,
    places: [...data.places, ...privatePlaces],
  });
}
