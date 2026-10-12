import "server-only";

import { ObjectId } from "bson";
import db from "@/lib/db";
import { STAR_MAP_SYSTEMS, type StarMapPlace } from "@/lib/star-map-layout";
import type { CelestialBody, Place, PlacePosition } from "@/types/places";

/** Un lot de l'inventaire, tel que la carte le montre à son propriétaire. */
export type StarMapLot = {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  quality?: number;
};

export type StarMapInventory = {
  /** Les lots, par lieu du catalogue. */
  byPlace: Record<string, StarMapLot[]>;
  /** Les lots rangés dans un lieu qu'un joueur a nommé lui-même : hors carte. */
  elsewhere: number;
};

type PlaceDoc = Pick<Place, "slug" | "name" | "type" | "parentSlug"> & {
  position?: PlacePosition;
  celestial?: CelestialBody;
};

/**
 * Les lieux des trois systèmes de la carte, avec de quoi les placer. Toutes
 * les profondeurs : un lieu sans position (un magasin de Lorville) ne se
 * dessine pas, mais se liste quand on zoome sur son parent.
 */
export async function getStarMapPlaces(): Promise<StarMapPlace[]> {
  const systems = [...STAR_MAP_SYSTEMS];
  const docs = (await db
    .db()
    .collection<Place>("gameLocations")
    .find(
      {
        $or: [{ slug: { $in: systems } }, { systemSlug: { $in: systems } }],
      },
      {
        projection: {
          _id: 0,
          slug: 1,
          name: 1,
          type: 1,
          parentSlug: 1,
          position: 1,
          celestial: 1,
        },
      },
    )
    .toArray()) as PlaceDoc[];

  return docs.map((doc) => {
    const place: StarMapPlace = {
      slug: doc.slug,
      name: doc.name,
      type: doc.type,
    };
    if (doc.parentSlug) place.parentSlug = doc.parentSlug;
    // Relevée en jeu ou importée de starmap.space ; un corps, par le NPS.
    const at = doc.position ?? doc.celestial;
    if (at) {
      place.at = { x: at.x, y: at.y, z: at.z };
      if ("body" in at && at.body) place.at.body = at.body;
    }
    const radius = doc.celestial?.radius;
    if (radius) place.radius = radius;
    return place;
  });
}

/**
 * L'inventaire d'un joueur, rangé par lieu du catalogue. Un lot dans un lieu
 * qu'il a nommé lui-même (« mon hangar ») n'a pas de place sur la carte : il
 * est seulement compté.
 */
export async function getStarMapInventory(
  userId: string,
): Promise<StarMapInventory> {
  const items = await db
    .db()
    .collection("inventoryItems")
    .find(
      { userId },
      {
        projection: {
          name: 1,
          quantity: 1,
          unit: 1,
          quality: 1,
          locationId: 1,
        },
      },
    )
    .sort({ name: 1 })
    .toArray();

  const locationIds = [...new Set(items.map((item) => String(item.locationId)))]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  const locations = await db
    .db()
    .collection("locations")
    .find(
      { _id: { $in: locationIds }, placeSlug: { $exists: true } },
      { projection: { placeSlug: 1 } },
    )
    .toArray();
  const placeOf = new Map(
    locations.map((location) => [
      String(location._id),
      location.placeSlug as string,
    ]),
  );

  const inventory: StarMapInventory = { byPlace: {}, elsewhere: 0 };
  for (const item of items) {
    const slug = placeOf.get(String(item.locationId));
    if (!slug) {
      inventory.elsewhere++;
      continue;
    }
    const lot: StarMapLot = {
      id: String(item._id),
      name: item.name as string,
      quantity: item.quantity as number,
    };
    if (item.unit) lot.unit = item.unit as string;
    if (typeof item.quality === "number") lot.quality = item.quality;
    (inventory.byPlace[slug] ??= []).push(lot);
  }
  return inventory;
}
