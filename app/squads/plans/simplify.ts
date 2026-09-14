import { PLAN_GRID, STROKE_MAX_POINTS } from "@/types/plan";

/**
 * Turning what a pointer did into what gets stored.
 *
 * A pen-up hands over a few hundred points sampled at whatever rate the device
 * felt like, in whatever size the canvas happened to be. What is stored is a
 * simplified trace in integers on the plan's own grid — so the same plan reads
 * the same on a desktop and on a phone, and so `5234` takes four bytes where
 * `0.5234567901234568` takes eighteen.
 */

/**
 * How far a point may sit from the line between its neighbours before it is
 * worth keeping, in grid units.
 *
 * Six of ten thousand: about half a pixel on a 1000-pixel canvas, which is
 * under what a hand can aim at and well under what an eye can see. A real
 * freehand arc comes out at twenty to sixty pairs.
 */
const EPSILON = 6;

/** Squared distance from `p` to the segment `a…b`, avoiding a square root. */
function sqDistanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return (px - ax) ** 2 + (py - ay) ** 2;
  }

  // Where the foot of the perpendicular falls along the segment, clamped to it.
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
  );

  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
}

/**
 * Ramer–Douglas–Peucker, iteratively.
 *
 * Recursion would be the shorter way to write it and the wrong way to run it: a
 * trace of a few thousand points from a fast pointer is deep enough to be worth
 * not putting on the stack.
 */
function rdp(points: number[], epsilon: number): number[] {
  const pairs = points.length / 2;
  if (pairs < 3) return points;

  const keep = new Uint8Array(pairs);
  keep[0] = 1;
  keep[pairs - 1] = 1;

  const stack: [number, number][] = [[0, pairs - 1]];
  const squared = epsilon * epsilon;

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last - first < 2) continue;

    let worst = 0;
    let at = -1;

    for (let index = first + 1; index < last; index += 1) {
      const distance = sqDistanceToSegment(
        points[index * 2],
        points[index * 2 + 1],
        points[first * 2],
        points[first * 2 + 1],
        points[last * 2],
        points[last * 2 + 1],
      );

      if (distance > worst) {
        worst = distance;
        at = index;
      }
    }

    if (at !== -1 && worst > squared) {
      keep[at] = 1;
      stack.push([first, at], [at, last]);
    }
  }

  const kept: number[] = [];

  for (let index = 0; index < pairs; index += 1) {
    if (keep[index]) kept.push(points[index * 2], points[index * 2 + 1]);
  }

  return kept;
}

/**
 * Drop every other point until the trace fits.
 *
 * Only ever reached by a scribble that survived simplification at two hundred
 * and fifty-six pairs, which is already far more than a briefing puts on a
 * canvas. Thinning beats refusing: the drawing is a little coarser and the
 * squad keeps it.
 */
function thin(points: number[]): number[] {
  let kept = points;

  while (kept.length > STROKE_MAX_POINTS * 2) {
    const thinner: number[] = [kept[0], kept[1]];

    for (let index = 2; index < kept.length / 2 - 1; index += 2) {
      thinner.push(kept[index * 2], kept[index * 2 + 1]);
    }

    thinner.push(kept[kept.length - 2], kept[kept.length - 1]);
    kept = thinner;
  }

  return kept;
}

/** A point of the canvas, on the grid: clamped, rounded, storable. */
export function toGrid(value: number): number {
  return Math.max(0, Math.min(PLAN_GRID, Math.round(value)));
}

/**
 * The trace as it will be stored: simplified, thinned if it has to be, and on
 * the grid.
 *
 * Straight kinds — a line, an arrow, a rectangle — arrive as their two defining
 * points already and pass through untouched; only a freehand trace is worth
 * simplifying.
 */
export function forStorage(points: number[], freehand: boolean): number[] {
  const snapped = points.map(toGrid);

  if (!freehand) return snapped;

  return thin(rdp(snapped, EPSILON));
}

/** The `d` of a polyline through a flat `[x, y, …]`, rounded corners and all. */
export function pathOf(points: number[]): string {
  if (points.length < 2) return "";

  let d = `M ${points[0]} ${points[1]}`;

  for (let index = 2; index < points.length; index += 2) {
    d += ` L ${points[index]} ${points[index + 1]}`;
  }

  return d;
}
