import "server-only";

import db from "@/lib/db";
import { MARKER_COLOR, PRIVATE_MARKER_COLOR } from "@/lib/star-map-layout";
import { getStarMapMarkers, getStarMapPrivatePlaces } from "@/lib/star-map";
import { geoOfPoint, planetMapUrl } from "@/lib/planet-map-geometry";
import type { StarMapPlace } from "@/lib/star-map-layout";
import type { Place, PlacePosition } from "@/types/places";
import type {
  PlanetMap,
  PlanetMapManifest,
  PlanetMapPoint,
} from "@/types/planet-maps";

/**
 * Les cartes de surface publiées : une par corps, dans la collection
 * `planetMaps` que remplit `npm run import:planet-maps`. Le document pointe
 * le dossier du build actif dans le blob storage ; changer de build, ou
 * revenir au précédent, ne change que ce pointeur.
 */
type PlanetMapDoc = {
  slug: string;
  baseUrl: string;
  manifest: PlanetMapManifest;
  updatedAt: Date;
};

const COLLECTION = "planetMaps";

export async function getPlanetMap(slug: string): Promise<PlanetMap | null> {
  const doc = await db
    .db()
    .collection<PlanetMapDoc>(COLLECTION)
    .findOne({ slug }, { projection: { _id: 0, baseUrl: 1, manifest: 1 } });
  return doc ? { manifest: doc.manifest, baseUrl: doc.baseUrl } : null;
}

/**
 * La texture de chaque corps qui a une carte, par slug : la Star Map la pose
 * sur la sphère quand on s'en approche, et n'offre le bouton « Carte » que là
 * où il mène.
 */
export async function listPlanetMapTextures(): Promise<Record<string, string>> {
  const docs = await db
    .db()
    .collection<PlanetMapDoc>(COLLECTION)
    .find(
      {},
      { projection: { _id: 0, slug: 1, baseUrl: 1, "manifest.texture": 1 } },
    )
    .toArray();
  return Object.fromEntries(
    docs.map((doc) => [
      doc.slug,
      planetMapUrl(doc.baseUrl, doc.manifest.texture),
    ]),
  );
}

export async function savePlanetMap(
  slug: string,
  baseUrl: string,
  manifest: PlanetMapManifest,
): Promise<void> {
  await db
    .db()
    .collection<PlanetMapDoc>(COLLECTION)
    .updateOne(
      { slug },
      { $set: { slug, baseUrl, manifest, updatedAt: new Date() } },
      { upsert: true },
    );
}

function pointOf(
  place: StarMapPlace,
  body: string,
  radius: number,
): (Omit<PlanetMapPoint, "kind" | "color" | "id"> & { id: string }) | null {
  if (!place.at || place.at.body !== body) return null;
  const geo = geoOfPoint(place.at, radius);
  return {
    id: place.slug,
    name: place.name,
    lat: geo.lat,
    lon: geo.lon,
    alt: geo.alt,
    type: place.type,
  };
}

/**
 * Ce qui se pose sur la carte d'un corps : les lieux du catalogue qui ont une
 * position dans son repère et, pour qui est connecté, ses lieux privés et ses
 * marqueurs (ceux qu'il voit, partagés compris). Les mêmes sources que la
 * Star Map, filtrées sur ce corps.
 */
/**
 * Les lieux publics posés sur ce corps, et eux seuls : une requête sur la
 * position, plutôt que tout le catalogue des trois systèmes filtré ensuite.
 */
async function placesOnBody(slug: string): Promise<StarMapPlace[]> {
  const docs = await db
    .db()
    .collection<Place>("gameLocations")
    .find(
      { "position.body": slug, privacy: { $exists: false } },
      { projection: { _id: 0, slug: 1, name: 1, type: 1, position: 1 } },
    )
    .toArray();
  return docs.map((doc) => {
    const position = doc.position as PlacePosition;
    return {
      slug: doc.slug,
      name: doc.name,
      type: doc.type,
      at: { body: position.body, x: position.x, y: position.y, z: position.z },
    };
  });
}

export async function getPlanetMapPoints(
  slug: string,
  radius: number,
  userId?: string,
): Promise<PlanetMapPoint[]> {
  const [places, privatePlaces, markers] = await Promise.all([
    placesOnBody(slug),
    userId ? getStarMapPrivatePlaces(userId) : [],
    userId ? getStarMapMarkers(userId) : [],
  ]);

  const points: PlanetMapPoint[] = [];
  for (const place of places) {
    const point = pointOf(place, slug, radius);
    if (!point) continue;
    points.push({
      ...point,
      kind: "place",
      color: MARKER_COLOR[place.type] ?? "#c9e4ff",
      href: `/lieux/${place.slug}`,
    });
  }
  for (const place of privatePlaces) {
    const point = pointOf(place, slug, radius);
    if (!point) continue;
    points.push({
      ...point,
      kind: "private",
      color: PRIVATE_MARKER_COLOR,
      href: `/lieux/${place.slug}`,
      org: place.private?.org,
    });
  }
  for (const marker of markers) {
    const point = pointOf(marker, slug, radius);
    if (!point || !marker.marker) continue;
    points.push({
      ...point,
      id: `marqueur-${marker.marker.id}`,
      kind: "marker",
      type: marker.marker.kind,
      color: marker.marker.color,
      href: "/marqueurs",
      collection: marker.marker.collection,
      note: marker.marker.note,
      org: marker.marker.org,
    });
  }
  return points;
}
