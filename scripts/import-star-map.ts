/**
 * Pose sur les lieux du catalogue où la Star Map (`/starmap`) les dessine.
 *
 *   npm run import:star-map -- [--dry-run] [--oc <oc.json>] [--pois <pois.json>]
 *
 * Les positions viennent de starmap.space (`lib/starmap-space.ts`) :
 *   - planètes et lunes : leur centre et leur rayon, dans le repère du
 *     système — y compris celles dont la rotation est encore provisoire, que
 *     `import:celestial-bodies` laisse au NPS faute de pouvoir s'y repérer ;
 *   - lieux posés sur un corps (villes, avant-postes, stations en orbite) :
 *     leur position dans le repère de ce corps, en mètres ;
 *   - stations des points de Lagrange et des points de saut : la position de
 *     ce point, plus leur décalage, dans le repère du système ;
 *   - lieux « dans l'espace » (Levski) : leur position dans le système.
 *
 * Un lieu se retrouve par son nom, dans son système : la même clé que pour les
 * corps (`bodyKey`), « Pyro V » et « Pyro5 » se valent. Un nom porté par deux
 * lieux du catalogue, ou par deux lieux de starmap.space (« Remote Outpost »),
 * est laissé : mieux vaut un lieu absent de la carte qu'un lieu à la place
 * d'un autre.
 *
 * Un lieu que le catalogue ne rattache à aucun système (les stations des
 * points de Lagrange de Stanton) se cherche dans tous ; `mapPosition.system`
 * dit alors à la carte sous quel système le ranger. Le catalogue, lui, garde
 * son arbre tel quel.
 *
 * Seul `mapPosition` est écrit, et retiré d'un lieu que la source ne place
 * plus. `position`, relevée par les joueurs, n'est pas touchée et l'emporte
 * à l'affichage. Idempotent : à relancer après un patch.
 */

import db from "@/lib/db";
import {
  bodyKey,
  coordinate,
  loadStarmapSpace,
  OC_URL,
  POIS_URL,
  type Container,
  type Poi,
} from "@/lib/starmap-space";
import { STAR_MAP_SYSTEMS } from "@/lib/star-map-layout";
import type { MapPosition, Place } from "@/types/places";

type Options = { dryRun: boolean; oc?: string; pois?: string };

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--oc" && argv[index + 1]) options.oc = argv[++index];
    else if (arg === "--pois" && argv[index + 1]) options.pois = argv[++index];
    else {
      console.error(`Option inconnue : ${arg}`);
      process.exit(1);
    }
  }
  return options;
}

type Candidate = Pick<Place, "slug" | "name" | "type" | "systemSlug">;

const BODY_TYPES = new Set(["planet", "moon"]);

/** Ce qui se pose dans l'espace : rien de ce qui se trouve au sol. */
const SPACE_TYPES = new Set(["station", "spaceport", "outpost", "city"]);

/** Les conteneurs qui portent des stations dans le vide. */
const SPACE_CONTAINERS = new Set(["Lagrange Point", "Jumppoint"]);

function xyz(
  entry: { XCoord: unknown; YCoord: unknown; ZCoord: unknown },
  scale: number,
): { x: number; y: number; z: number } | null {
  const x = coordinate(entry.XCoord as string);
  const y = coordinate(entry.YCoord as string);
  const z = coordinate(entry.ZCoord as string);
  if (x === null || y === null || z === null) return null;
  return { x: x * scale, y: y * scale, z: z * scale };
}

/**
 * Les noms sous lesquels les lieux citent un conteneur. Son nom affiché, son
 * nom interne — sauf quand la source y a mis le nom du système, comme pour
 * les points de saut de Stanton — et, pour un point de saut, la forme
 * `jumppoint_stanton_pyro` que les stations de Stanton emploient.
 */
function containerNames(container: Container, system: string): string[] {
  const names = [container.ObjectContainer];
  const internal = container.InternalName ?? "";
  if (internal && bodyKey(internal) !== system) names.push(internal);
  if (container.Type === "Jumppoint") {
    const words = container.ObjectContainer.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (word) =>
          word && !["jump", "point", "jumppoint", system].includes(word),
      );
    if (words.length === 1) names.push(`jumppoint_${system}_${words[0]}`);
  }
  return names;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [containers, pois] = await Promise.all([
    loadStarmapSpace<Container>(OC_URL, options.oc),
    loadStarmapSpace<Poi>(POIS_URL, options.pois),
  ]);

  const systems = new Map(
    STAR_MAP_SYSTEMS.map((slug) => [bodyKey(slug), slug] as const),
  );

  const places = db.db().collection<Place>("gameLocations");
  const candidates = (await places
    .find(
      // Sans système : un lieu que le catalogue ne rattache à rien encore.
      {
        $or: [
          { systemSlug: { $in: [...STAR_MAP_SYSTEMS] } },
          { systemSlug: { $exists: false } },
        ],
      },
      { projection: { _id: 0, slug: 1, name: 1, type: 1, systemSlug: 1 } },
    )
    .toArray()) as Candidate[];

  // Système, puis nom. Deux lieux du même nom dans un système : ambigu. Un
  // lieu sans système se cherche dans chacun.
  const index = new Map<string, Candidate[]>();
  for (const place of candidates) {
    const key = `${place.systemSlug ?? "*"}:${bodyKey(place.name)}`;
    index.set(key, [...(index.get(key) ?? []), place]);
  }
  const lookup = (system: string, name: string) => [
    ...(index.get(`${system}:${bodyKey(name)}`) ?? []),
    ...(index.get(`*:${bodyKey(name)}`) ?? []),
  ];
  // « ARC-L1-A Wide Forest Station » chez starmap.space, « ARC-L1 Wide Forest
  // Station » au catalogue : la lettre du module se perd.
  const find = (system: string, name: string) => {
    const found = lookup(system, name);
    const short = name.replace(/(-L\d)-[A-Z](?=\s)/i, "$1");
    return found.length > 0 || short === name ? found : lookup(system, short);
  };

  const writes = new Map<string, { label: string; position: MapPosition }>();
  const ambiguous = new Set<string>();
  const missing: string[] = [];

  function propose(
    system: string,
    name: string,
    position: MapPosition,
    accept: (place: Candidate) => boolean,
  ) {
    const label = `${name} (${system})`;
    const found = find(system, name).filter(accept);
    if (found.length === 0) {
      missing.push(label);
      return;
    }
    if (found.length > 1) {
      ambiguous.add(label);
      return;
    }
    const slug = found[0].slug;
    if (!found[0].systemSlug) position = { ...position, system };
    // Deux lieux de la source pour un seul du catalogue : on ne choisit pas.
    if (writes.has(slug)) {
      ambiguous.add(label);
      writes.delete(slug);
      return;
    }
    writes.set(slug, { label, position });
  }

  // Corps célestes, et l'index des conteneurs par nom pour les lieux.
  const bodies = new Map<string, string>(); // conteneur → slug du corps
  const spaceContainers = new Map<
    string,
    { x: number; y: number; z: number }
  >();
  for (const container of containers) {
    const system = systems.get(bodyKey(container.System));
    if (!system) continue;
    const center = xyz(container, 1);
    if (!center) continue;
    const names = containerNames(container, system).map(
      (name) => `${system}:${name.toLowerCase()}`,
    );

    if (container.Type === "Planet") {
      const radius = coordinate(container.BodyRadius);
      const found = find(system, container.ObjectContainer).filter((place) =>
        BODY_TYPES.has(place.type),
      );
      if (found.length === 1 && radius && radius > 0) {
        writes.set(found[0].slug, {
          label: `${container.ObjectContainer} (${system})`,
          position: { ...center, radius },
        });
        names.forEach((name) => bodies.set(name, found[0].slug));
      } else if (found.length === 0) {
        missing.push(`${container.ObjectContainer} (${system})`);
      }
    } else if (SPACE_CONTAINERS.has(container.Type)) {
      names.forEach((name) => spaceContainers.set(name, center));
    }
  }

  // Les lieux, en trois cas selon ce qui les porte.
  // Chaque lieu, avec sa position s'il est porté par un conteneur connu.
  type Located = {
    system: string;
    name: string;
    position: MapPosition;
    accept: (place: Candidate) => boolean;
  };
  const located: Located[] = [];
  for (const poi of pois) {
    const system = systems.get(bodyKey(poi.System));
    const name = poi.PoiName.trim();
    if (!system || !name) continue;

    const host = `${system}:${poi.Planet.toLowerCase()}`;
    const body = bodies.get(host);
    const spacePoint = spaceContainers.get(host);

    if (body) {
      const local = xyz(poi, 1000); // kilomètres → mètres
      if (local) {
        located.push({
          system,
          name,
          position: { body, ...local },
          accept: (place) => !BODY_TYPES.has(place.type),
        });
      }
    } else if (spacePoint) {
      // Le décalage de la station depuis le point, en kilomètres.
      const offset = xyz(poi, 1000) ?? { x: 0, y: 0, z: 0 };
      located.push({
        system,
        name,
        position: {
          x: spacePoint.x + offset.x,
          y: spacePoint.y + offset.y,
          z: spacePoint.z + offset.z,
        },
        accept: (place) => SPACE_TYPES.has(place.type),
      });
    } else if (poi.Planet === "Space") {
      const point = xyz(poi, 1);
      if (point) {
        located.push({
          system,
          name,
          position: point,
          accept: (place) => !BODY_TYPES.has(place.type),
        });
      }
    }
  }

  // « Remote Outpost » et ses semblables : un nom, plusieurs lieux placés.
  // Levski, lui, est cité deux fois mais placé une seule : il reste.
  const counts = new Map<string, number>();
  for (const { system, name } of located) {
    const key = `${system}:${name.toLowerCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const { system, name, position, accept } of located) {
    if ((counts.get(`${system}:${name.toLowerCase()}`) ?? 0) > 1) continue;
    propose(system, name, position, accept);
  }

  for (const [slug, { label, position }] of writes) {
    console.log(`${label} → ${slug}`);
    if (!options.dryRun) {
      await places.updateOne({ slug }, { $set: { mapPosition: position } });
    }
  }
  // Ce que la source ne place plus (renommé, ou devenu ambigu) quitte la carte.
  const stale = candidates
    .map((place) => place.slug)
    .filter((slug) => !writes.has(slug));
  if (!options.dryRun) {
    await places.updateMany(
      { slug: { $in: stale }, mapPosition: { $exists: true } },
      { $unset: { mapPosition: "" } },
    );
  }

  console.log(
    options.dryRun
      ? `\nRien écrit : --dry-run. ${writes.size} lieu(x) à poser.`
      : `\nTerminé : ${writes.size} lieu(x) posé(s) sur la carte.`,
  );
  if (ambiguous.size > 0) {
    console.log(`Noms ambigus, laissés : ${[...ambiguous].join(", ")}`);
  }
  console.log(
    `${missing.length} lieu(x) de starmap.space absents du catalogue.`,
  );

  await db.close();
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});
