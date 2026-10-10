import type { NpsBody, NpsPlace, PlacePosition } from "@/types/places";

/**
 * The geometry of the NPS — Nexus Positioning System.
 *
 * **A copy of `nexus-app/src/lib/nps.ts`**, kept identical so that the MCP
 * server (`nps_locate`) and the overlay of the app agree on every distance and
 * heading. A change to one goes to the other.
 *
 * `/showlocation` gives the player's position in the frame of the star
 * system, centred on its star. That frame does not move, but planets and
 * moons turn on themselves, and everything near one turns with it: an outpost
 * never has the same system position twice. So a place on a body is stored in
 * that body's frame with the rotation undone, where it stays put, and turned
 * back into the system frame at the moment of each reading.
 *
 * The rotation model is the one of the community navigation tool by Valalol
 * (MIT): a body turns at a constant rate, and its angle on 2020-01-01 00:00
 * UTC — `rotationAdjust` — pins it to the clock. A slightly wrong constant
 * shifts every place of that body by the same angle, recorded and read back
 * through the same model: distances between places stay right. The bodies'
 * values themselves come from starmap.space, through the site.
 *
 * Coordinates are metres throughout; angles are degrees at the edges.
 */

/** One reading of `/showlocation`, stamped with when it was seen. */
export type Fix = {
  x: number;
  y: number;
  z: number;
  /** Milliseconds since the Unix epoch. */
  at: number;
};

type Vector = { x: number; y: number; z: number };

const EPOCH_MS = Date.UTC(2020, 0, 1);

/** Under this, two readings are the same spot: no direction of travel. */
export const MIN_TRAVEL_M = 20;

/** Past this, a reading says nothing about where one is heading now. */
export const MAX_TRAVEL_AGE_MS = 10 * 60 * 1000;

/** Under this, in metres a second, one is neither closing in nor moving away. */
export const MIN_CLOSING_SPEED = 0.5;

const DEG = Math.PI / 180;

function sub(a: Vector, b: Vector): Vector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vector, b: Vector): Vector {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function length(v: Vector): number {
  return Math.hypot(v.x, v.y, v.z);
}

function dot(a: Vector, b: Vector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Turns `v` by `angle` radians around the body's axis, `z`. */
function rotateZ(v: Vector, angle: number): Vector {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos, z: v.z };
}

/** How far `body` has turned at `at`, in radians. */
function rotation(body: NpsBody, at: number): number {
  const degreesPerSecond =
    body.rotationHours > 0 ? 360 / (body.rotationHours * 3600) : 0;
  const degrees =
    (degreesPerSecond * ((at - EPOCH_MS) / 1000) + body.rotationAdjust) % 360;
  return degrees * DEG;
}

/**
 * The body one is on or near, if any: the nearest centre among those whose
 * turning zone holds the point.
 */
export function bodyAt(point: Vector, bodies: NpsBody[]): NpsBody | null {
  let found: NpsBody | null = null;
  let best = Infinity;
  for (const body of bodies) {
    const distance = length(sub(point, body));
    if (distance <= body.zoneRadius && distance < best) {
      found = body;
      best = distance;
    }
  }
  return found;
}

/** A system-frame reading, in the frame of `body`, rotation undone. */
export function toBodyFrame(fix: Fix, body: NpsBody): Vector {
  return rotateZ(sub(fix, body), -rotation(body, fix.at));
}

/** A point of `body`'s frame, in the system frame at `at`. */
export function toSystemFrame(
  local: Vector,
  body: NpsBody,
  at: number,
): Vector {
  return add(rotateZ(local, rotation(body, at)), body);
}

/** Where the player stands, as the site stores a place's position. */
export function positionOf(fix: Fix, bodies: NpsBody[]): PlacePosition {
  const body = bodyAt(fix, bodies);
  if (!body) return { x: fix.x, y: fix.y, z: fix.z };
  const local = toBodyFrame(fix, body);
  return { body: body.slug, x: local.x, y: local.y, z: local.z };
}

/**
 * A stored position, in the system frame at `at`; `null` when its body is not
 * one the site describes any more.
 */
export function systemPositionOf(
  position: PlacePosition,
  bodies: NpsBody[],
  at: number,
): Vector | null {
  if (!position.body) return position;
  const body = bodies.find((one) => one.slug === position.body);
  return body ? toSystemFrame(position, body, at) : null;
}

export type Geo = {
  /** Degrees, north positive. */
  latitude: number;
  /** Degrees, east positive, in (-180, 180]. */
  longitude: number;
  /** Metres above the ground's radius. */
  altitude: number;
};

/** Latitude, longitude and altitude of a point of a body's frame. */
export function geoOf(local: Vector, body: NpsBody): Geo {
  const radius = length(local);
  return {
    latitude: radius > 0 ? Math.asin(local.z / radius) / DEG : 0,
    longitude: Math.atan2(local.y, local.x) / DEG,
    altitude: radius - body.radius,
  };
}

function normalize360(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Into (-180, 180]: negative to the left, positive to the right. */
function normalize180(degrees: number): number {
  const turned = normalize360(degrees);
  return turned > 180 ? turned - 360 : turned;
}

/**
 * The compass bearing from one point of a body to another, along the great
 * circle — what one would follow flying low. North is 0°, east 90°.
 */
function bearing(from: Vector, to: Vector, body: NpsBody): number {
  const a = geoOf(from, body);
  const b = geoOf(to, body);
  const phi1 = a.latitude * DEG;
  const phi2 = b.latitude * DEG;
  const dLambda = (b.longitude - a.longitude) * DEG;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return normalize360(Math.atan2(y, x) / DEG);
}

/** Over the ground, at the ground's radius. */
function surfaceDistance(from: Vector, to: Vector, body: NpsBody): number {
  const cosine = dot(from, to) / (length(from) * length(to) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * body.radius;
}

/** What the overlay shows about a destination. */
export type Guidance = {
  /** In a straight line, in metres. */
  distance: number;
  /** Both on the same body: over the ground, and the bearing to follow. */
  surface?: { distance: number; heading: number };
  /**
   * The destination relative to the direction of travel since the previous
   * reading, in degrees: on a body, signed — negative is to the left; in
   * space, how far off course, unsigned, since nothing says which side.
   */
  turn?: { degrees: number; signed: boolean };
  /** Metres a second closer since the previous reading; negative: farther. */
  closingSpeed?: number;
  /** Seconds to arrival at that speed, when getting closer. */
  eta?: number;
};

/** Distance, bearing and turn to `target`, from the latest reading. */
export function guide(
  current: Fix,
  previous: Fix | null,
  target: PlacePosition,
  bodies: NpsBody[],
): Guidance | null {
  const here = systemPositionOf(target, bodies, current.at);
  if (!here) return null;
  const guidance: Guidance = { distance: length(sub(here, current)) };

  const body = bodyAt(current, bodies);
  const sameBody = Boolean(body && target.body === body.slug);
  const local = body ? toBodyFrame(current, body) : null;
  if (body && local && sameBody) {
    guidance.surface = {
      distance: surfaceDistance(local, target, body),
      heading: bearing(local, target, body),
    };
  }

  const usable =
    previous &&
    current.at > previous.at &&
    current.at - previous.at <= MAX_TRAVEL_AGE_MS;
  if (!previous || !usable) return guidance;

  const there = systemPositionOf(target, bodies, previous.at);
  if (there) {
    const before = length(sub(there, previous));
    const seconds = (current.at - previous.at) / 1000;
    const speed = (before - guidance.distance) / seconds;
    guidance.closingSpeed = speed;
    if (speed > MIN_CLOSING_SPEED) guidance.eta = guidance.distance / speed;
  }

  if (body && local && sameBody && bodyAt(previous, bodies) === body) {
    // Both readings in the body's frame: the ground track, which is what a
    // heading means near a planet.
    const start = toBodyFrame(previous, body);
    if (length(sub(local, start)) >= MIN_TRAVEL_M) {
      guidance.turn = {
        degrees: normalize180(
          guidance.surface!.heading - bearing(start, local, body),
        ),
        signed: true,
      };
    }
  } else if (!body && !bodyAt(previous, bodies)) {
    const travel = sub(current, previous);
    const toward = sub(here, current);
    if (length(travel) >= MIN_TRAVEL_M && length(toward) > 0) {
      const cosine = dot(travel, toward) / (length(travel) * length(toward));
      guidance.turn = {
        degrees: Math.acos(Math.max(-1, Math.min(1, cosine))) / DEG,
        signed: false,
      };
    }
  }

  return guidance;
}

/**
 * Whether a place can be reached from `system`: each system has its own frame,
 * centred on its star, so coordinates from two of them do not compare. An
 * unknown side does not rule anything out.
 */
export function inSystem(
  place: { systemSlug?: string },
  system: string | null,
): boolean {
  return !place.systemSlug || !system || place.systemSlug === system;
}

/** The recorded places of `system` nearest to a reading, closest first. */
export function nearestPlaces(
  fix: Fix,
  places: NpsPlace[],
  bodies: NpsBody[],
  system: string | null,
  count: number,
): { place: NpsPlace; distance: number }[] {
  return places
    .filter((place) => inSystem(place, system))
    .flatMap((place) => {
      const point = systemPositionOf(place.position, bodies, fix.at);
      return point ? [{ place, distance: length(sub(point, fix)) }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

/** The eight compass points. */
export const COMPASS_POINTS = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
] as const;

export type CompassPoint = (typeof COMPASS_POINTS)[number];

export function compassPoint(heading: number): CompassPoint {
  return COMPASS_POINTS[Math.round(normalize360(heading) / 45) % 8];
}

/** A number as `/showlocation` writes it: `-18930539540.392`, `1e3`. */
const NUMBER = String.raw`([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)`;

const COORDINATES = new RegExp(
  String.raw`coordinates:\s*x:\s*${NUMBER}\s+y:\s*${NUMBER}\s+z:\s*${NUMBER}`,
  "i",
);

/**
 * The three coordinates of a `/showlocation` line
 * (`Coordinates: x:12850457093.000 y:0.000 z:0.000`), wherever it sits in the
 * text, or `null`. The app reads the same line in `src-tauri/src/nps.rs`.
 */
export function parseShowLocation(
  text: string,
): { x: number; y: number; z: number } | null {
  const match = COORDINATES.exec(text);
  if (!match) return null;
  const [x, y, z] = match.slice(1, 4).map(Number);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}
