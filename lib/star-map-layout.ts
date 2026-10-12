/**
 * La géométrie de la Star Map (`/starmap`) : où chaque lieu se dessine dans la
 * scène 3D, à partir des positions en mètres du catalogue.
 *
 * À l'échelle, Stanton tiendrait dans un écran et ses lunes seraient des
 * pixels perdus à côté de leur planète. On compresse donc, chaque niveau à sa
 * façon, en gardant les directions : les distances au soleil en racine carrée,
 * celles d'une lune à sa planète aussi, l'altitude d'une station en
 * logarithme. Les rapports se perdent, l'ordre et les angles restent.
 *
 * Repère du jeu : X et Y dans le plan des orbites, Z vers le nord. Repère de la
 * scène (Three.js) : Y vers le haut. On passe de l'un à l'autre par
 * (x, y, z) → (x, z, −y).
 *
 * Pur et sans Three.js : se teste et se relit sans navigateur.
 */

import type { PlaceType } from "@/types/places";

/** Les systèmes que la carte montre, par leur slug au catalogue. */
export const STAR_MAP_SYSTEMS = ["stanton", "pyro", "nyx"] as const;

export type StarMapSystem = (typeof STAR_MAP_SYSTEMS)[number];

/** Où chaque système se tient dans la scène, et sa couleur. */
export const SYSTEM_LOOK: Record<
  StarMapSystem,
  { center: Vec3; color: string; sky: [string, string, string] }
> = {
  stanton: {
    center: [-250, 0, 140],
    color: "#7fc4ff",
    sky: ["#1d4fa0", "#0f7d93", "#3a2f8a"],
  },
  pyro: {
    center: [270, 0, 90],
    color: "#ff8a3d",
    sky: ["#8a2f12", "#b0571c", "#5a1240"],
  },
  nyx: {
    center: [10, -20, -300],
    color: "#b59bff",
    sky: ["#3b2a8f", "#1f7a6a", "#7a2a8a"],
  },
};

/** Les couloirs de saut tracés entre les systèmes. */
export const STAR_MAP_LANES: [StarMapSystem, StarMapSystem][] = [
  ["stanton", "pyro"],
  ["pyro", "nyx"],
  ["stanton", "nyx"],
];

export type Vec3 = [number, number, number];

/** Un lieu tel que le serveur l'envoie à la carte. */
export type StarMapPlace = {
  slug: string;
  name: string;
  type: PlaceType;
  parentSlug?: string;
  /**
   * Où il se trouve, en mètres : la position relevée par les joueurs, sinon
   * celle de starmap.space, sinon le centre d'un corps pour le NPS.
   */
  at?: { body?: string; x: number; y: number; z: number };
  /** Le rayon d'un corps, en mètres. */
  radius?: number;
};

/** Un lieu placé dans la scène. */
export type LaidOutPlace = StarMapPlace & {
  system: StarMapSystem | null;
  children: string[];
  /** Où il se dessine ; `null` : il n'a pas de position, on le liste seulement. */
  world: Vec3 | null;
  /** Rayon affiché d'un corps, en unités de scène. */
  r: number;
  /** Posé au sol d'un corps : la normale de la surface à cet endroit. */
  normal?: Vec3;
  /** Placé faute de mieux : aucune position connue pour un corps. */
  approx?: boolean;
};

export const BODY_TYPES: ReadonlySet<PlaceType> = new Set(["planet", "moon"]);

/** Unités de scène pour un milliard de mètres, en racine carrée. */
const SYSTEM_SCALE = 7;

/** En deçà de tant de rayons du corps, un point de l'espace est en orbite. */
const ORBIT_RADII = 15;

/** Sous 2 % du rayon d'altitude, un lieu est au sol. */
const GROUND_ALTITUDE = 0.02;

/** Deux planètes plus proches que ça dans la scène se gêneraient : on écarte. */
const MIN_PLANET_GAP = 6;

const toScene = (x: number, y: number, z: number): Vec3 => [x, z, -y];

const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
const unit = (v: Vec3): Vec3 => {
  const l = length(v);
  return l > 0 ? scale(v, 1 / l) : [1, 0, 0];
};

/** Rayon affiché d'un corps de `radius` mètres. */
export function bodyRadius(radius?: number): number {
  return radius && radius > 0 ? 0.8 * (radius / 1e6) ** 0.45 : 0.45;
}

/** Une distance au soleil, en mètres, dans la scène. */
function systemDistance(metres: number): number {
  return SYSTEM_SCALE * Math.sqrt(metres / 1e9);
}

/** La distance d'une lune à sa planète, dans la scène. */
function moonDistance(metres: number, parentR: number): number {
  return parentR + 0.9 + 1.5 * Math.sqrt(metres / 1e7);
}

/** La distance d'un lieu au centre de son corps, dans la scène. */
function altitudeDistance(altitude: number, radius: number, r: number): number {
  if (altitude < radius * GROUND_ALTITUDE) return r * 1.004;
  return r * (1.15 + 0.5 * Math.log2(1 + altitude / radius));
}

/** Un angle stable tiré d'un slug, pour placer ce qui n'a pas de position. */
function angleOf(slug: string): number {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (((hash >>> 0) % 3600) / 3600) * Math.PI * 2;
}

function rotateAround(point: Vec3, center: Vec3, angle: number): Vec3 {
  const dx = point[0] - center[0];
  const dz = point[2] - center[2];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [center[0] + dx * c - dz * s, point[1], center[2] + dx * s + dz * c];
}

export function isStarMapSystem(slug: string): slug is StarMapSystem {
  return (STAR_MAP_SYSTEMS as readonly string[]).includes(slug);
}

/** Place tous les lieux dans la scène. */
export function layoutStarMap(
  places: StarMapPlace[],
): Map<string, LaidOutPlace> {
  const out = new Map<string, LaidOutPlace>();
  for (const place of places) {
    out.set(place.slug, {
      ...place,
      system: null,
      children: [],
      world: null,
      r: 0,
    });
  }
  for (const place of out.values()) {
    if (place.parentSlug) out.get(place.parentSlug)?.children.push(place.slug);
  }

  // Le système de chaque lieu, en remontant.
  const systemOf = (place: LaidOutPlace): StarMapSystem | null => {
    let current: LaidOutPlace | undefined = place;
    for (let depth = 0; current && depth < 12; depth++) {
      if (isStarMapSystem(current.slug)) return current.slug;
      current = current.parentSlug ? out.get(current.parentSlug) : undefined;
    }
    return null;
  };
  for (const place of out.values()) place.system = systemOf(place);

  for (const system of STAR_MAP_SYSTEMS) {
    const root = out.get(system);
    if (root) {
      root.world = SYSTEM_LOOK[system].center;
      root.r = 3;
    }
  }

  // Le corps le plus proche au-dessus d'un lieu dans l'arbre.
  const bodyAbove = (place: LaidOutPlace): LaidOutPlace | undefined => {
    let current = place.parentSlug ? out.get(place.parentSlug) : undefined;
    while (current && !BODY_TYPES.has(current.type)) {
      current = current.parentSlug ? out.get(current.parentSlug) : undefined;
    }
    return current;
  };

  // Planètes d'abord, lunes ensuite : une lune se place depuis sa planète.
  const bodies = [...out.values()].filter(
    (place) => place.system && BODY_TYPES.has(place.type),
  );
  const planets = bodies.filter((body) => !bodyAbove(body));
  const moons = bodies.filter((body) => bodyAbove(body));

  for (const planet of planets) {
    const center = SYSTEM_LOOK[planet.system!].center;
    planet.r = bodyRadius(planet.radius);
    if (planet.at && !planet.at.body) {
      const v = toScene(planet.at.x, planet.at.y, planet.at.z);
      planet.world = add(center, scale(unit(v), systemDistance(length(v))));
    }
  }
  // Sans position, une planète prend une orbite à part, au-delà des autres.
  const unplaced = planets.filter((planet) => !planet.world);
  unplaced.forEach((planet, index) => {
    const center = SYSTEM_LOOK[planet.system!].center;
    const distance = 30 + index * 6;
    const angle = angleOf(planet.slug);
    planet.world = add(center, [
      Math.cos(angle) * distance,
      0,
      Math.sin(angle) * distance,
    ]);
    planet.approx = true;
  });
  // Deux planètes collées (Pyro IV et Pyro V chez starmap.space) : on écarte
  // la seconde sur son orbite, pour que chacune se lise.
  for (let i = 0; i < planets.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = planets[i];
      const b = planets[j];
      if (a.system !== b.system) continue;
      const center = SYSTEM_LOOK[a.system!].center;
      const gap = length(add(a.world!, scale(b.world!, -1)));
      if (gap < MIN_PLANET_GAP) {
        const orbit = Math.max(
          1,
          Math.hypot(a.world![0] - center[0], a.world![2] - center[2]),
        );
        a.world = rotateAround(
          a.world!,
          center,
          (MIN_PLANET_GAP * 1.5) / orbit,
        );
      }
    }
  }

  for (const moon of moons) {
    const parent = bodyAbove(moon)!;
    moon.r = bodyRadius(moon.radius);
    if (!parent.world) continue;
    if (moon.at && !moon.at.body && parent.at && !parent.at.body) {
      const v = toScene(
        moon.at.x - parent.at.x,
        moon.at.y - parent.at.y,
        moon.at.z - parent.at.z,
      );
      moon.world = add(
        parent.world,
        scale(unit(v), moonDistance(length(v), parent.r)),
      );
    } else {
      const angle = angleOf(moon.slug);
      const distance = moonDistance(6e7, parent.r);
      moon.world = add(parent.world, [
        Math.cos(angle) * distance,
        0,
        Math.sin(angle) * distance,
      ]);
      moon.approx = true;
    }
  }

  // Le reste : au sol ou en orbite d'un corps, ou dans l'espace du système.
  const placedBodies = bodies.filter(
    (body) => body.world && body.at && !body.at.body,
  );
  for (const place of out.values()) {
    if (!place.system || place.world || !place.at || BODY_TYPES.has(place.type))
      continue;
    const at = place.at;

    let body: LaidOutPlace | undefined;
    let local: Vec3 | null = null;
    if (at.body) {
      body = out.get(at.body);
      local = [at.x, at.y, at.z];
    } else {
      // Un point du système tout près d'un corps : il est en orbite autour.
      for (const candidate of placedBodies) {
        if (candidate.system !== place.system || !candidate.radius) continue;
        const d: Vec3 = [
          at.x - candidate.at!.x,
          at.y - candidate.at!.y,
          at.z - candidate.at!.z,
        ];
        if (length(d) < candidate.radius * ORBIT_RADII) {
          body = candidate;
          local = d;
          break;
        }
      }
    }

    if (body?.world && local) {
      const radius = body.radius ?? 1e6;
      const altitude = length(local) - radius;
      const normal = unit(toScene(local[0], local[1], local[2]));
      place.world = add(
        body.world,
        scale(normal, altitudeDistance(altitude, radius, body.r)),
      );
      if (altitude < radius * GROUND_ALTITUDE) place.normal = normal;
    } else if (!at.body) {
      const v = toScene(at.x, at.y, at.z);
      place.world = add(
        SYSTEM_LOOK[place.system].center,
        scale(unit(v), systemDistance(length(v))),
      );
    }
  }

  return out;
}
