/**
 * La géométrie d'un relevé : projections, arêtes, angles, centres.
 *
 * Pur, sans React ni DOM, comme `plan-render.ts` — l'éditeur s'en sert pour
 * décider où poser une porte, le moteur pour décider où poser une étiquette.
 *
 * Ce fichier existe surtout pour arrêter une dérive : `atan2` et `hypot` sont
 * aujourd'hui réécrits à une douzaine d'endroits du dépôt, chaque fois un peu
 * différemment. La projection sur un segment, elle, était déjà écrite — dans le
 * simplificateur du canvas de briefing, en privé. Elle vit ici maintenant, et
 * `app/squads/plans/simplify.ts` la lit au lieu de la garder.
 *
 * Tout est en centimètres du relevé, comme le reste du modèle.
 */

import type { PlanRoom } from "@/types/places";

export type Point = { x: number; y: number };
export type Segment = { a: Point; b: Point };

/**
 * Le pied de la perpendiculaire de `p` sur le segment `a…b`, borné au segment.
 *
 * `distSq` évite une racine carrée à qui ne fait que comparer. `t` dit *où* le
 * pied tombe le long du segment, entre 0 et 1 : c'est lui qui permet de poser
 * une porte au milieu d'un mur plutôt qu'à son coin.
 */
export function projectOnSegment(
  p: Point,
  a: Point,
  b: Point,
): { distSq: number; t: number; x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) {
    return {
      distSq: (p.x - a.x) ** 2 + (p.y - a.y) ** 2,
      t: 0,
      x: a.x,
      y: a.y,
    };
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
  );
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { distSq: (p.x - x) ** 2 + (p.y - y) ** 2, t, x, y };
}

/** Un point tourné de `degrees` autour de `pivot`. */
export function rotatePoint(p: Point, pivot: Point, degrees: number): Point {
  if (!degrees) return p;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/**
 * Les parois d'une pièce, telles qu'on les voit.
 *
 * Un polygone donne le tour de ses sommets, refermé. Un rectangle donne ses
 * quatre côtés **déjà tournés** de son orientation : sans cela, poser une porte
 * sur une salle inclinée l'accrocherait à des murs qui ne sont plus là.
 */
export function roomEdges(room: PlanRoom): Segment[] {
  const corners: Point[] = room.points?.length
    ? Array.from({ length: room.points.length / 2 }, (unused, index) => ({
        x: room.points![index * 2],
        y: room.points![index * 2 + 1],
      }))
    : (() => {
        const pivot = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
        return [
          { x: room.x, y: room.y },
          { x: room.x + room.w, y: room.y },
          { x: room.x + room.w, y: room.y + room.h },
          { x: room.x, y: room.y + room.h },
        ].map((corner) => rotatePoint(corner, pivot, room.rot));
      })();

  return corners.map((a, index) => ({
    a,
    b: corners[(index + 1) % corners.length],
  }));
}

/**
 * La paroi la plus proche d'un point, et son inclinaison.
 *
 * L'angle suit la convention du modèle — celle qu'emploie déjà la poignée de
 * rotation de l'éditeur — pour qu'une porte et une pièce veuillent dire la même
 * chose par « trente degrés ».
 */
export function nearestEdge(
  rooms: PlanRoom[],
  p: Point,
): { angleDeg: number; x: number; y: number; distSq: number } | null {
  let best: { angleDeg: number; x: number; y: number; distSq: number } | null =
    null;

  for (const room of rooms) {
    for (const edge of roomEdges(room)) {
      const hit = projectOnSegment(p, edge.a, edge.b);
      if (best && hit.distSq >= best.distSq) continue;
      best = {
        distSq: hit.distSq,
        x: hit.x,
        y: hit.y,
        angleDeg:
          (Math.atan2(edge.b.y - edge.a.y, edge.b.x - edge.a.x) * 180) /
          Math.PI,
      };
    }
  }

  return best;
}

/**
 * Le centre de gravité d'un contour.
 *
 * Le centre de la boîte englobante ne convient pas : sur une pièce en L il
 * tombe dans l'échancrure, donc hors de la pièce, et l'étiquette avec lui. La
 * formule de l'aire signée règle le cas courant ; sur un contour dégénéré
 * — aire nulle — elle retombe sur la moyenne des sommets, qui est au moins
 * définie.
 */
export function polygonCentroid(points: number[]): Point {
  const count = Math.floor(points.length / 2);
  if (count < 3) {
    return { x: points[0] ?? 0, y: points[1] ?? 0 };
  }

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const x0 = points[index * 2];
    const y0 = points[index * 2 + 1];
    const x1 = points[next * 2];
    const y1 = points[next * 2 + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }

  if (twiceArea === 0) {
    let sx = 0;
    let sy = 0;
    for (let index = 0; index < count; index += 1) {
      sx += points[index * 2];
      sy += points[index * 2 + 1];
    }
    return { x: sx / count, y: sy / count };
  }

  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}
