import type { NpsBody, NpsPlace, PlacePosition } from "@/types/places";
import { toBodyFrame, toSystemFrame } from "@/lib/nps-geometry";

/**
 * Se rapprocher d'un point quelconque par un saut quantique coupé.
 *
 * C'est la méthode de l'Aaron Halo (`lib/aaron-halo.ts`) appliquée à un point
 * plutôt qu'à une bande : un saut va en ligne droite vers sa balise, et le
 * HUD affiche la distance qui reste jusqu'à l'arrivée. On cherche la paire
 * départ → arrivée dont la ligne passe le plus près du point visé, et l'on
 * coupe le saut quand la distance restante vaut celle qui sépare l'arrivée du
 * point de la ligne le plus proche de la cible.
 *
 * Il reste deux écarts, qu'on additionne (en quadrature) pour classer les
 * trajets : la distance entre la ligne et la cible, et l'imprécision de la
 * coupe à la main, qu'on suppose proportionnelle à la distance restante (le
 * vaisseau va d'autant plus vite qu'il est loin de l'arrivée), plafonnée à
 * la vitesse de croisière. Un saut jusqu'au bout, vers la balise la plus
 * proche, est aussi un trajet : il n'a que le premier écart.
 *
 * Un trajet qui passe dans une planète, une lune ou l'étoile est refusé par
 * le jeu : on l'écarte. Un point au sol ou en orbite basse ne se rejoint pas
 * ainsi, le corps est sur la ligne : on recommande de sauter vers le lieu le
 * plus proche sur ce corps, ou vers le corps, et de finir en vol.
 *
 * Positions en mètres, dans le repère du système, à l'instant `at` : un lieu
 * en orbite tourne avec son corps.
 *
 * Ce fichier est partagé avec l'app de bureau (`src/lib/quantum-route.ts` de
 * nexus-app), qui en garde une copie : le même trajet doit donner la même
 * distance des deux côtés. Seuls les imports diffèrent.
 */

export type QtVector = { x: number; y: number; z: number };

export type QtBeaconKind = "place" | "body";

/** Une balise de saut quantique : un lieu dans l'espace, ou un corps. */
export interface QtBeacon extends QtVector {
  /** Le slug du lieu ou du corps. */
  id: string;
  name: string;
  kind: QtBeaconKind;
  /**
   * Pour un corps, à quelle distance de son centre le saut s'arrête : ses
   * marqueurs orbitaux. 0 pour un lieu, où l'on arrive sur la balise.
   */
  arrivalRadius: number;
  /** Le corps autour duquel tourne un lieu en orbite. */
  bodyName?: string;
}

/** Ce qui coupe un trajet : un corps, avec sa marge. */
export interface QtObstacle extends QtVector {
  id: string;
  name: string;
  /** Sous cette distance de son centre, un trajet est refusé. */
  clearance: number;
}

/** De quoi calculer dans un système. */
export interface QtSystem {
  systemSlug: string;
  bodies: NpsBody[];
  beacons: QtBeacon[];
  obstacles: QtObstacle[];
  /** Les lieux posés sur un corps, pour un point au sol. */
  surfacePlaces: NpsPlace[];
  at: number;
}

/**
 * Les marqueurs orbitaux sont au tiers du rayon de la zone où le repère du
 * corps tourne avec lui (`ZONE_PER_ORBITAL_MARKER` de l'import des corps).
 */
export const ORBITAL_MARKER_SHARE = 1 / 3;

/**
 * Un trajet est refusé s'il passe à moins de ce multiple du rayon d'un corps :
 * le sol, l'atmosphère et une marge. Estimation, à confirmer en jeu.
 */
export const OBSTACLE_MARGIN = 1.2;

/**
 * L'étoile, au centre du repère, n'est pas parmi les corps : on l'écarte avec
 * ce rayon (celle de Stanton fait environ 0,7 Gm en jeu).
 */
export const STAR_CLEARANCE = 1e9;

/** Sous cette longueur, le jeu ne lance pas de saut. */
export const MIN_JUMP = 100e3;

/** L'imprécision d'une coupe à la main, en part de la distance restante… */
export const CUT_ERROR_SHARE = 0.01;
/** … et au plus (un quart de seconde à pleine vitesse). */
export const CUT_ERROR_MAX = 10_000e3;

/** Combien de trajets on propose. */
export const DEFAULT_QT_LIMIT = 5;

function sub(a: QtVector, b: QtVector): QtVector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: QtVector, b: QtVector): QtVector {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v: QtVector, k: number): QtVector {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

function dot(a: QtVector, b: QtVector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function norm(v: QtVector): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function qtDistance(a: QtVector, b: QtVector): number {
  return norm(sub(a, b));
}

/** Le rayon des marqueurs orbitaux d'un corps. */
export function orbitalMarkerRadius(body: NpsBody): number {
  return body.zoneRadius * ORBITAL_MARKER_SHARE;
}

/**
 * Les balises et les obstacles d'un système à l'instant `at`, d'après ce que
 * `GET /api/lieux/nps` donne. Les lieux privés et les marqueurs n'ont pas de
 * balise en jeu : ils sont laissés.
 */
export function quantumSystem(
  bodies: NpsBody[],
  places: NpsPlace[],
  systemSlug: string,
  at: number,
): QtSystem {
  const inSystem = bodies.filter((body) => body.systemSlug === systemSlug);
  const bySlug = new Map(inSystem.map((body) => [body.slug, body]));

  const obstacles: QtObstacle[] = [
    { id: "star", name: "star", x: 0, y: 0, z: 0, clearance: STAR_CLEARANCE },
    ...inSystem.map((body) => ({
      id: body.slug,
      name: body.name,
      x: body.x,
      y: body.y,
      z: body.z,
      clearance: body.radius * OBSTACLE_MARGIN,
    })),
  ];

  const beacons: QtBeacon[] = inSystem.map((body) => ({
    id: body.slug,
    name: body.name,
    kind: "body",
    x: body.x,
    y: body.y,
    z: body.z,
    arrivalRadius: orbitalMarkerRadius(body),
  }));
  const surfacePlaces: NpsPlace[] = [];

  for (const place of places) {
    // Un corps sans relevé (rayon, rotation) n'est ni une balise sûre ni un
    // obstacle qu'on sache éviter : il attend l'import des corps.
    if (place.private || place.type === "planet" || place.type === "moon")
      continue;
    const position = place.position;
    let point: QtVector;
    let bodyName: string | undefined;
    if (position.body) {
      const body = bySlug.get(position.body);
      if (!body) continue;
      if (norm(position) <= body.radius * OBSTACLE_MARGIN) {
        surfacePlaces.push(place);
        continue;
      }
      point = toSystemFrame(position, body, at);
      bodyName = body.name;
    } else {
      if (place.systemSlug !== systemSlug) continue;
      point = { x: position.x, y: position.y, z: position.z };
    }
    // Deux fiches au même endroit (une station et son point de Lagrange) :
    // une seule balise.
    if (beacons.some((one) => qtDistance(one, point) < 1_000)) continue;
    beacons.push({
      id: place.slug,
      name: place.name,
      kind: "place",
      ...point,
      arrivalRadius: 0,
      ...(bodyName ? { bodyName } : {}),
    });
  }

  return {
    systemSlug,
    bodies: inSystem,
    beacons,
    obstacles,
    surfacePlaces,
    at,
  };
}

/** Le point visé, dans le repère du système, et le corps qui le porte. */
export interface QtTarget extends QtVector {
  name?: string;
  /** Le corps dont le repère tourne autour du point, s'il y en a un. */
  body?: NpsBody;
  /** Sa position dans le repère de ce corps. */
  local?: QtVector;
}

/**
 * Une position telle que le site la garde (dans le repère d'un corps ou du
 * système) vue à l'instant `at` ; `null` quand son corps n'est pas connu.
 */
export function qtTarget(
  position: PlacePosition | QtVector,
  system: QtSystem,
  name?: string,
): QtTarget | null {
  const bodySlug = (position as PlacePosition).body;
  if (bodySlug) {
    const body = system.bodies.find((one) => one.slug === bodySlug);
    if (!body) return null;
    const local = { x: position.x, y: position.y, z: position.z };
    return {
      ...toSystemFrame(local, body, system.at),
      body,
      local,
      ...(name ? { name } : {}),
    };
  }
  const point = { x: position.x, y: position.y, z: position.z };
  // Une position du système près d'un corps : on retrouve son repère.
  let found: NpsBody | undefined;
  for (const body of system.bodies) {
    const distance = qtDistance(point, body);
    if (
      distance <= body.zoneRadius &&
      (!found || distance < qtDistance(point, found))
    )
      found = body;
  }
  return {
    ...point,
    ...(name ? { name } : {}),
    ...(found
      ? { body: found, local: toBodyFrame({ ...point, at: system.at }, found) }
      : {}),
  };
}

/** Un trajet proposé. */
export interface QtCandidate {
  /** `null` : le point de départ donné (la position du joueur). */
  from: QtBeacon | null;
  to: QtBeacon;
  /** `false` : on va jusqu'au bout du saut, la balise est la plus proche. */
  cut: boolean;
  /** La longueur du saut, jusqu'à l'arrivée. */
  length: number;
  /** La distance restante que le HUD affiche quand il faut couper. */
  remaining: number;
  /** La distance parcourue jusque-là. */
  travelled: number;
  /** L'écart entre la ligne et la cible. */
  offset: number;
  /** L'écart attendu après la coupe, coupe à la main comprise. */
  error: number;
  /** Où l'on sort du saut, dans le repère du système. */
  exit: QtVector;
}

/** Le point de la balise où le saut s'arrête, en venant de `from`. */
function arrivalOf(from: QtVector, to: QtBeacon): QtVector | null {
  if (to.arrivalRadius === 0) return to;
  const towards = sub(from, to);
  const distance = norm(towards);
  if (distance <= to.arrivalRadius) return null;
  return add(to, scale(towards, to.arrivalRadius / distance));
}

/** Le segment `from → arrival` passe-t-il dans un obstacle ? */
function blocked(
  from: QtVector,
  arrival: QtVector,
  obstacles: QtObstacle[],
): boolean {
  const delta = sub(arrival, from);
  const squared = dot(delta, delta);
  for (const obstacle of obstacles) {
    const back = sub(from, obstacle);
    // On part de ce corps : seul compte de ne pas le traverser.
    if (norm(back) < obstacle.clearance) {
      if (dot(back, delta) < 0) return true;
      continue;
    }
    const s = Math.max(0, Math.min(1, -dot(back, delta) / squared));
    if (norm(add(back, scale(delta, s))) < obstacle.clearance) return true;
  }
  return false;
}

function cutError(remaining: number): number {
  return Math.min(remaining * CUT_ERROR_SHARE, CUT_ERROR_MAX);
}

/** Un trajet de `from` vers `to` pour approcher `target`, s'il en est un. */
export function qtCandidate(
  from: QtVector,
  fromBeacon: QtBeacon | null,
  to: QtBeacon,
  target: QtVector,
  obstacles: QtObstacle[],
): QtCandidate | null {
  const arrival = arrivalOf(from, to);
  if (!arrival) return null;
  const delta = sub(arrival, from);
  const length = norm(delta);
  if (length < MIN_JUMP) return null;
  const t = dot(sub(target, from), delta) / (length * length);
  // La cible est derrière le départ : ce saut s'en éloigne.
  if (t <= 0) return null;
  if (blocked(from, arrival, obstacles)) return null;
  const cut = t < 1;
  const along = Math.min(t, 1);
  const exit = add(from, scale(delta, along));
  const remaining = (1 - along) * length;
  const offset = qtDistance(target, exit);
  return {
    from: fromBeacon,
    to,
    cut,
    length,
    remaining,
    travelled: along * length,
    offset,
    error: cut ? Math.hypot(offset, cutError(remaining)) : offset,
    exit,
  };
}

/** Un point au sol ou en orbite basse : où sauter, puis finir en vol. */
export interface QtSurfacePlan {
  body: NpsBody;
  /** L'altitude de la cible au-dessus du sol. */
  altitude: number;
  /** Les lieux du corps les plus proches, et leur distance à la cible. */
  places: { place: NpsPlace; distance: number }[];
  /** Ce qu'il reste au moins à faire en arrivant sur les marqueurs orbitaux. */
  fromOrbit: number;
}

export type QtPlan =
  | { kind: "space"; target: QtTarget; candidates: QtCandidate[] }
  | { kind: "surface"; target: QtTarget; surface: QtSurfacePlan };

export interface QtOptions {
  /** Le départ : une balise, ou un point (la position du joueur). */
  from?: QtBeacon | QtVector | null;
  limit?: number;
}

function isBeacon(value: QtBeacon | QtVector): value is QtBeacon {
  return typeof (value as QtBeacon).id === "string";
}

/**
 * Les meilleurs trajets vers `target`, l'écart attendu le plus petit
 * d'abord. Sans départ, toutes les paires de balises du système, chaque
 * ligne dans un seul sens ; un saut jusqu'au bout ne compte qu'une fois par
 * arrivée.
 */
export function planQuantumRoute(
  target: QtTarget,
  system: QtSystem,
  options: QtOptions = {},
): QtPlan {
  const limit = options.limit ?? DEFAULT_QT_LIMIT;

  if (target.body && target.local) {
    const body = target.body;
    const radius = norm(target.local);
    if (radius < orbitalMarkerRadius(body)) {
      const local = target.local;
      const places = system.surfacePlaces
        .filter((place) => place.position.body === body.slug)
        .map((place) => ({
          place,
          distance: qtDistance(place.position, local),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
      return {
        kind: "surface",
        target,
        surface: {
          body,
          altitude: radius - body.radius,
          places,
          fromOrbit: orbitalMarkerRadius(body) - radius,
        },
      };
    }
  }

  const departures: { point: QtVector; beacon: QtBeacon | null }[] =
    options.from
      ? [
          {
            point: options.from,
            beacon: isBeacon(options.from) ? options.from : null,
          },
        ]
      : system.beacons.map((beacon) => ({ point: beacon, beacon }));

  const best = new Map<string, QtCandidate>();
  for (const departure of departures) {
    for (const to of system.beacons) {
      if (departure.beacon && to.id === departure.beacon.id) continue;
      const candidate = qtCandidate(
        departure.point,
        departure.beacon,
        to,
        target,
        system.obstacles,
      );
      if (!candidate) continue;
      // A → B et B → A suivent la même ligne : on garde le meilleur sens.
      const ends = [departure.beacon?.id ?? "", to.id].sort().join("|");
      const key = candidate.cut ? ends : `>${to.id}`;
      const known = best.get(key);
      if (!known || candidate.error < known.error) best.set(key, candidate);
    }
  }

  const candidates = [...best.values()]
    .sort((a, b) => a.error - b.error)
    .slice(0, limit);
  return { kind: "space", target, candidates };
}

export function findQtBeacon(
  system: QtSystem,
  id: string | null | undefined,
): QtBeacon | undefined {
  return id ? system.beacons.find((beacon) => beacon.id === id) : undefined;
}

/** Une distance comme le HUD l'affiche : Gm, Mm ou km. */
export function qtUnits(meters: number): {
  value: number;
  unit: "Gm" | "Mm" | "km";
  digits: number;
} {
  const abs = Math.abs(meters);
  if (abs >= 1e9) return { value: meters / 1e9, unit: "Gm", digits: 2 };
  if (abs >= 1e6) return { value: meters / 1e6, unit: "Mm", digits: 1 };
  return { value: meters / 1e3, unit: "km", digits: 0 };
}

/** La même, en texte, pour l'outil MCP. */
export function qtText(meters: number): string {
  const { value, unit, digits } = qtUnits(meters);
  return `${value.toFixed(digits)} ${unit}`;
}
