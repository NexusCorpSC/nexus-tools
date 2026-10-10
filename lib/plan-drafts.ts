import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { normalizePlacePlan } from "@/lib/places";
import { nearestEdge, rotatePoint, type Point } from "@/lib/plan-geometry";
import type {
  DrawnPlacePlan,
  PlacePlanMarker,
  PlanDoor,
  PlanLabel,
  PlanLevel,
  PlanMeasure,
  PlanRoom,
  PlanWall,
} from "@/types/places";

/**
 * Les brouillons de plans dessinés par des agents (serveur MCP).
 *
 * Le protocole MCP est sans état : un relevé fait en plusieurs appels se garde
 * ici, au nom du joueur, sous un identifiant que l'agent repasse à chaque
 * appel. Le contenu est un `DrawnPlacePlan` ordinaire, normalisé par
 * `normalizePlacePlan` à chaque écriture : ce qu'un agent dessine est
 * exactement ce que l'éditeur du site produirait, et sa soumission est une
 * contribution `plan` comme une autre. Un brouillon oublié expire (index TTL).
 */

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_OPEN_DRAFTS = 10;

/** La taille d'une porte posée par l'éditeur, en centimètres. */
export const DOOR_CM = { w: 130, h: 40 };
/** L'épaisseur par défaut d'un mur seul. */
export const WALL_CM = 20;

export type DbPlanDraft = {
  _id: ObjectId;
  userId: string;
  placeSlug: string;
  placeName: string;
  plan: DrawnPlacePlan;
  /** Le plan publié dont il part, quand il en modifie un. */
  basedOn?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

const drafts = () => db.db().collection<DbPlanDraft>("placePlanDrafts");

/** Un identifiant d'élément, de la forme de ceux de l'éditeur (nanoid). */
export function newElementId(): string {
  return randomBytes(9).toString("base64url");
}

export async function countOpenDrafts(userId: string): Promise<number> {
  return drafts().countDocuments({ userId, expiresAt: { $gt: new Date() } });
}

export async function listDrafts(userId: string): Promise<DbPlanDraft[]> {
  return drafts()
    .find({ userId, expiresAt: { $gt: new Date() } })
    .sort({ updatedAt: -1 })
    .limit(MAX_OPEN_DRAFTS * 2)
    .toArray();
}

export async function getDraft(
  userId: string,
  draftId: string,
): Promise<DbPlanDraft | null> {
  if (!ObjectId.isValid(draftId)) return null;
  return drafts().findOne({
    _id: new ObjectId(draftId),
    userId,
    expiresAt: { $gt: new Date() },
  });
}

export async function createDraft(input: {
  userId: string;
  placeSlug: string;
  placeName: string;
  plan: DrawnPlacePlan;
  basedOn?: string;
}): Promise<DbPlanDraft> {
  const now = new Date();
  const doc: DbPlanDraft = {
    _id: new ObjectId(),
    ...input,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + DRAFT_TTL_MS),
  };
  await drafts().insertOne(doc);
  return doc;
}

/** Enregistre le plan d'un brouillon ; chaque écriture repousse l'expiration. */
export async function saveDraftPlan(
  draft: DbPlanDraft,
  plan: DrawnPlacePlan,
): Promise<void> {
  const now = new Date();
  await drafts().updateOne(
    { _id: draft._id, userId: draft.userId },
    {
      $set: {
        plan,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + DRAFT_TTL_MS),
      },
    },
  );
}

export async function deleteDraft(
  userId: string,
  draftId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(draftId)) return false;
  const result = await drafts().deleteOne({
    _id: new ObjectId(draftId),
    userId,
  });
  return result.deletedCount > 0;
}

// ─── Normalisation ──────────────────────────────────────────────────────────

function elementIds(plan: DrawnPlacePlan): Set<string> {
  const ids = new Set<string>(plan.markers.map((marker) => marker.id));
  for (const level of plan.levels) {
    ids.add(level.id);
    for (const list of [
      level.rooms,
      level.walls,
      level.doors,
      level.labels,
      level.measures,
    ]) {
      for (const element of list) ids.add(element.id);
    }
  }
  return ids;
}

/**
 * Le plan tel que le site le rangerait, et les éléments que la normalisation
 * a dû laisser tomber (repère qui ne désigne rien, texte vide, au-delà des
 * limites…) : l'agent doit savoir que ce qu'il a posé n'existe pas.
 */
export function normalizeDraftPlan(
  raw: unknown,
  slug: string,
  identity: { id: string },
): { plan: DrawnPlacePlan; dropped: string[] } | null {
  const candidate = {
    ...(raw as Record<string, unknown>),
    id: identity.id,
    kind: "drawn",
  };
  const plan = normalizePlacePlan(candidate, slug);
  if (!plan || plan.kind !== "drawn") return null;
  const before = elementIds(candidate as unknown as DrawnPlacePlan);
  const after = elementIds(plan as DrawnPlacePlan);
  return {
    plan: plan as DrawnPlacePlan,
    dropped: [...before].filter((id) => !after.has(id)),
  };
}

// ─── Opérations ─────────────────────────────────────────────────────────────

export type Side = "north" | "south" | "east" | "west";

export type DraftOp =
  | {
      op: "set_plan";
      name?: string;
      note?: string;
      widthCm?: number;
      heightCm?: number;
    }
  | { op: "add_level"; id?: string; name: string; position?: "top" | "bottom" }
  | { op: "rename_level"; levelId: string; name: string }
  | {
      op: "add_room";
      levelId: string;
      id?: string;
      name: string;
      kind: PlanRoom["kind"];
      fill?: PlanRoom["fill"];
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      points?: number[];
      rot?: number;
      stair?: "up" | "down";
      label?: boolean;
      note?: string;
      nextTo?: {
        room: string;
        side: Side;
        gap?: number;
        align?: "start" | "center" | "end";
      };
    }
  | {
      op: "add_wall";
      levelId: string;
      id?: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      thickness?: number;
    }
  | {
      op: "add_door";
      levelId: string;
      id?: string;
      x: number;
      y: number;
      kind?: PlanDoor["kind"];
      width?: number;
      snap?: boolean;
    }
  | {
      op: "add_label";
      levelId: string;
      id?: string;
      text: string;
      x: number;
      y: number;
      rot?: number;
    }
  | {
      op: "add_measure";
      levelId: string;
      id?: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      op: "add_marker";
      levelId?: string;
      id?: string;
      x: number;
      y: number;
      service?: string;
      place?: string;
      glyph?: string;
      label?: string;
      note?: string;
    }
  | { op: "update"; id: string; set: Record<string, unknown> }
  | { op: "move"; id: string; dx: number; dy: number }
  | { op: "remove"; id: string };

export class DraftOpError extends Error {}

type Located =
  | { type: "level"; level: PlanLevel }
  | { type: "room"; level: PlanLevel; element: PlanRoom }
  | { type: "wall"; level: PlanLevel; element: PlanWall }
  | { type: "door"; level: PlanLevel; element: PlanDoor }
  | { type: "label"; level: PlanLevel; element: PlanLabel }
  | { type: "measure"; level: PlanLevel; element: PlanMeasure }
  | { type: "marker"; element: PlacePlanMarker };

const LISTS = ["rooms", "walls", "doors", "labels", "measures"] as const;
const LIST_TYPES = {
  rooms: "room",
  walls: "wall",
  doors: "door",
  labels: "label",
  measures: "measure",
} as const;

function locate(plan: DrawnPlacePlan, id: string): Located | null {
  const marker = plan.markers.find((one) => one.id === id);
  if (marker) return { type: "marker", element: marker };
  for (const level of plan.levels) {
    if (level.id === id) return { type: "level", level };
    for (const list of LISTS) {
      const element = (level[list] as { id: string }[]).find(
        (one) => one.id === id,
      );
      if (element) {
        return { type: LIST_TYPES[list], level, element } as Located;
      }
    }
  }
  return null;
}

function levelOf(plan: DrawnPlacePlan, levelId: string): PlanLevel {
  const level = plan.levels.find((one) => one.id === levelId);
  if (!level) throw new DraftOpError(`Unknown level ${levelId}`);
  return level;
}

function freshId(plan: DrawnPlacePlan, wanted?: string): string {
  if (!wanted) return newElementId();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(wanted)) {
    throw new DraftOpError(
      `Invalid id "${wanted}": 1-40 letters, digits, - or _`,
    );
  }
  if (locate(plan, wanted)) throw new DraftOpError(`Id ${wanted} is taken`);
  return wanted;
}

/** Une pièce désignée par son identifiant ou son nom (sans casse). */
function findRoom(level: PlanLevel, reference: string): PlanRoom {
  const byId = level.rooms.find((room) => room.id === reference);
  if (byId) return byId;
  const lower = reference.trim().toLowerCase();
  const byName = level.rooms.filter(
    (room) => room.name.trim().toLowerCase() === lower,
  );
  if (byName.length === 1) return byName[0];
  throw new DraftOpError(
    byName.length
      ? `Several rooms are named "${reference}" on ${level.name}: use the id`
      : `No room "${reference}" on ${level.name}`,
  );
}

function bboxOfPoints(points: number[]) {
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Le rectangle d'une pièce posée contre une autre. */
function besides(
  anchor: PlanRoom,
  w: number,
  h: number,
  side: Side,
  gap = 0,
  align: "start" | "center" | "end" = "start",
) {
  const along = (start: number, size: number, own: number) =>
    align === "center"
      ? start + (size - own) / 2
      : align === "end"
        ? start + size - own
        : start;
  switch (side) {
    case "east":
      return { x: anchor.x + anchor.w + gap, y: along(anchor.y, anchor.h, h) };
    case "west":
      return { x: anchor.x - gap - w, y: along(anchor.y, anchor.h, h) };
    case "south":
      return { x: along(anchor.x, anchor.w, w), y: anchor.y + anchor.h + gap };
    case "north":
      return { x: along(anchor.x, anchor.w, w), y: anchor.y - gap - h };
  }
}

/** Un segment en rectangle tourné, comme l'éditeur range un mur. */
function segmentRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
) {
  const length = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1)));
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return {
    x: Math.round(cx - length / 2),
    y: Math.round(cy - thickness / 2),
    w: length,
    h: thickness,
    rot: Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI),
  };
}

/** Les murs seuls d'un niveau, vus comme des pièces pour l'accroche des portes. */
function wallsAsRooms(level: PlanLevel): PlanRoom[] {
  return level.walls.map((wall) => ({
    ...wall,
    name: "",
    kind: "technical",
    fill: "plain",
    label: false,
  }));
}

const fraction = (value: number, size: number) =>
  Number(Math.min(1, Math.max(0, value / size)).toFixed(4));

/**
 * Applique un lot d'opérations à une copie du plan. Tout ou rien : la première
 * opération impossible lève une `DraftOpError` qui nomme son rang, et le
 * brouillon n'est pas touché. Rend les identifiants créés, dans l'ordre.
 */
export function applyDraftOps(
  source: DrawnPlacePlan,
  ops: DraftOp[],
): { plan: DrawnPlacePlan; created: { op: number; id: string }[] } {
  const plan = structuredClone(source);
  const created: { op: number; id: string }[] = [];

  ops.forEach((op, index) => {
    try {
      switch (op.op) {
        case "set_plan": {
          if (op.name !== undefined) plan.name = op.name;
          if (op.note !== undefined) plan.note = op.note || undefined;
          if (op.widthCm !== undefined) plan.widthCm = op.widthCm;
          if (op.heightCm !== undefined) plan.heightCm = op.heightCm;
          break;
        }
        case "add_level": {
          const id = freshId(plan, op.id);
          const level: PlanLevel = {
            id,
            name: op.name,
            order: 0,
            rooms: [],
            walls: [],
            doors: [],
            labels: [],
            measures: [],
          };
          if (op.position === "bottom") plan.levels.unshift(level);
          else plan.levels.push(level);
          created.push({ op: index, id });
          break;
        }
        case "rename_level": {
          levelOf(plan, op.levelId).name = op.name;
          break;
        }
        case "add_room": {
          const level = levelOf(plan, op.levelId);
          const id = freshId(plan, op.id);
          let box: { x: number; y: number; w: number; h: number };
          if (op.points?.length) {
            box = bboxOfPoints(op.points);
          } else {
            if (!op.w || !op.h) {
              throw new DraftOpError("A rectangular room needs w and h");
            }
            if (op.nextTo) {
              const anchor = findRoom(level, op.nextTo.room);
              box = {
                ...besides(
                  anchor,
                  op.w,
                  op.h,
                  op.nextTo.side,
                  op.nextTo.gap,
                  op.nextTo.align,
                ),
                w: op.w,
                h: op.h,
              };
            } else {
              if (op.x === undefined || op.y === undefined) {
                throw new DraftOpError("Give x and y, or nextTo");
              }
              box = { x: op.x, y: op.y, w: op.w, h: op.h };
            }
          }
          level.rooms.push({
            id,
            name: op.name,
            kind: op.kind,
            fill: op.fill ?? (op.kind === "circulation" ? "corridor" : "plain"),
            ...box,
            rot: op.rot ?? 0,
            points: op.points?.length ? op.points : undefined,
            stair: op.stair,
            label: op.label !== false,
            note: op.note,
          });
          created.push({ op: index, id });
          break;
        }
        case "add_wall": {
          const level = levelOf(plan, op.levelId);
          const id = freshId(plan, op.id);
          level.walls.push({
            id,
            ...segmentRect(op.x1, op.y1, op.x2, op.y2, op.thickness ?? WALL_CM),
          });
          created.push({ op: index, id });
          break;
        }
        case "add_door": {
          const level = levelOf(plan, op.levelId);
          const id = freshId(plan, op.id);
          const width = op.width ?? DOOR_CM.w;
          let center: Point = { x: op.x, y: op.y };
          let rot = 0;
          if (op.snap !== false) {
            const edge = nearestEdge(
              [...level.rooms, ...wallsAsRooms(level)],
              center,
            );
            if (!edge || edge.distSq > width * width) {
              throw new DraftOpError(
                "No wall within a door's width of this point: place it on a room edge, or pass snap: false",
              );
            }
            center = { x: edge.x, y: edge.y };
            rot = Math.round(edge.angleDeg);
          }
          level.doors.push({
            id,
            kind: op.kind ?? "single",
            x: Math.round(center.x - width / 2),
            y: Math.round(center.y - DOOR_CM.h / 2),
            w: width,
            h: DOOR_CM.h,
            rot,
          });
          created.push({ op: index, id });
          break;
        }
        case "add_label": {
          const level = levelOf(plan, op.levelId);
          const id = freshId(plan, op.id);
          level.labels.push({
            id,
            text: op.text,
            x: op.x,
            y: op.y,
            rot: op.rot ?? 0,
          });
          created.push({ op: index, id });
          break;
        }
        case "add_measure": {
          const level = levelOf(plan, op.levelId);
          const id = freshId(plan, op.id);
          level.measures.push({
            id,
            x1: op.x1,
            y1: op.y1,
            x2: op.x2,
            y2: op.y2,
          });
          created.push({ op: index, id });
          break;
        }
        case "add_marker": {
          if (op.levelId) levelOf(plan, op.levelId);
          if (!op.place && !op.service && !op.glyph) {
            throw new DraftOpError(
              "A marker needs a place, a service or a glyph",
            );
          }
          const id = freshId(plan, op.id);
          plan.markers.push({
            id,
            x: fraction(op.x, plan.widthCm),
            y: fraction(op.y, plan.heightCm),
            levelId: op.levelId ?? plan.levels[0]?.id,
            targetSlug: op.place,
            service: op.service as PlacePlanMarker["service"],
            glyph: op.glyph as PlacePlanMarker["glyph"],
            label: op.label,
            note: op.note,
          });
          created.push({ op: index, id });
          break;
        }
        case "update": {
          const found = locate(plan, op.id);
          if (!found) throw new DraftOpError(`Unknown element ${op.id}`);
          const set = { ...op.set };
          delete set.id;
          if (found.type === "level") {
            if (typeof set.name === "string") found.level.name = set.name;
            break;
          }
          if (found.type === "marker") {
            if (typeof set.x === "number") {
              set.x = fraction(set.x, plan.widthCm);
            }
            if (typeof set.y === "number") {
              set.y = fraction(set.y, plan.heightCm);
            }
            if (typeof set.place === "string") {
              set.targetSlug = set.place;
              delete set.place;
            }
          }
          Object.assign(found.element, set);
          if (found.type === "room" && Array.isArray(set.points)) {
            Object.assign(found.element, bboxOfPoints(set.points as number[]));
          }
          break;
        }
        case "move": {
          const found = locate(plan, op.id);
          if (!found || found.type === "level") {
            throw new DraftOpError(`Unknown element ${op.id}`);
          }
          if (found.type === "marker") {
            found.element.x = fraction(
              found.element.x * plan.widthCm + op.dx,
              plan.widthCm,
            );
            found.element.y = fraction(
              found.element.y * plan.heightCm + op.dy,
              plan.heightCm,
            );
          } else if (found.type === "measure") {
            found.element.x1 += op.dx;
            found.element.x2 += op.dx;
            found.element.y1 += op.dy;
            found.element.y2 += op.dy;
          } else {
            found.element.x += op.dx;
            found.element.y += op.dy;
            if (found.type === "room" && found.element.points) {
              found.element.points = found.element.points.map((value, at) =>
                at % 2 === 0 ? value + op.dx : value + op.dy,
              );
            }
          }
          break;
        }
        case "remove": {
          const found = locate(plan, op.id);
          if (!found) throw new DraftOpError(`Unknown element ${op.id}`);
          if (found.type === "marker") {
            plan.markers = plan.markers.filter((one) => one.id !== op.id);
          } else if (found.type === "level") {
            if (plan.levels.length === 1) {
              throw new DraftOpError("A plan keeps at least one level");
            }
            plan.levels = plan.levels.filter((one) => one.id !== op.id);
            plan.markers = plan.markers.filter((one) => one.levelId !== op.id);
          } else {
            for (const list of LISTS) {
              (found.level[list] as { id: string }[]) = (
                found.level[list] as { id: string }[]
              ).filter((one) => one.id !== op.id);
            }
          }
          break;
        }
      }
    } catch (error) {
      if (error instanceof DraftOpError) {
        throw new DraftOpError(
          `Operation ${index} (${op.op}): ${error.message}`,
        );
      }
      throw error;
    }
  });

  return { plan, created };
}

// ─── Contrôle ───────────────────────────────────────────────────────────────

function roomCorners(room: PlanRoom): Point[] {
  if (room.points?.length) {
    return Array.from({ length: room.points.length / 2 }, (_, index) => ({
      x: room.points![index * 2],
      y: room.points![index * 2 + 1],
    }));
  }
  const pivot = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h },
    { x: room.x, y: room.y + room.h },
  ].map((corner) => rotatePoint(corner, pivot, room.rot));
}

function bounds(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  };
}

/**
 * Ce qui cloche probablement dans un relevé, pour que l'agent se corrige
 * avant de soumettre : niveau vide, pièce hors de l'emprise, pièces qui se
 * chevauchent (boîtes englobantes, donc approximatif), porte loin de tout
 * mur, repère vers un lieu inconnu ou un niveau disparu.
 */
export function planAnomalies(
  plan: DrawnPlacePlan,
  knownSlugs: Set<string>,
): string[] {
  const issues: string[] = [];
  const levelIds = new Set(plan.levels.map((level) => level.id));

  for (const level of plan.levels) {
    if (level.rooms.length === 0) {
      issues.push(`Level "${level.name}" (${level.id}) has no room.`);
    }
    const boxes = level.rooms.map((room) => ({
      room,
      box: bounds(roomCorners(room)),
    }));
    for (const { room, box } of boxes) {
      if (
        box.x1 < 0 ||
        box.y1 < 0 ||
        box.x2 > plan.widthCm ||
        box.y2 > plan.heightCm
      ) {
        issues.push(
          `Room "${room.name}" (${room.id}) on ${level.name} goes outside the plan extent (${plan.widthCm}×${plan.heightCm} cm).`,
        );
      }
    }
    const solid = boxes.filter(
      ({ room }) => room.kind !== "outside" && room.fill !== "none",
    );
    for (let a = 0; a < solid.length; a += 1) {
      for (let b = a + 1; b < solid.length; b += 1) {
        const one = solid[a].box;
        const two = solid[b].box;
        const w = Math.min(one.x2, two.x2) - Math.max(one.x1, two.x1);
        const h = Math.min(one.y2, two.y2) - Math.max(one.y1, two.y1);
        if (w <= 0 || h <= 0) continue;
        const smaller = Math.min(
          (one.x2 - one.x1) * (one.y2 - one.y1),
          (two.x2 - two.x1) * (two.y2 - two.y1),
        );
        if (w * h > smaller * 0.05) {
          issues.push(
            `Rooms "${solid[a].room.name}" (${solid[a].room.id}) and "${solid[b].room.name}" (${solid[b].room.id}) on ${level.name} overlap.`,
          );
        }
      }
    }
    const walls = [...level.rooms, ...wallsAsRooms(level)];
    for (const door of level.doors) {
      const center = { x: door.x + door.w / 2, y: door.y + door.h / 2 };
      const edge = nearestEdge(walls, center);
      if (!edge || edge.distSq > 60 * 60) {
        issues.push(
          `Door ${door.id} on ${level.name} is not on a wall (its center is more than 60 cm from any room edge or wall).`,
        );
      }
    }
  }

  for (const marker of plan.markers) {
    if (marker.levelId && !levelIds.has(marker.levelId)) {
      issues.push(`Marker ${marker.id} is on a level that no longer exists.`);
    }
    if (marker.targetSlug && !knownSlugs.has(marker.targetSlug)) {
      issues.push(
        `Marker ${marker.id} points to an unknown place: ${marker.targetSlug}.`,
      );
    }
  }

  return issues.slice(0, 60);
}

/** Les lieux que les repères désignent et qui existent. */
export async function existingPlaceSlugs(
  plan: DrawnPlacePlan,
): Promise<Set<string>> {
  const slugs = [
    ...new Set(
      plan.markers
        .map((marker) => marker.targetSlug)
        .filter((slug): slug is string => !!slug),
    ),
  ];
  if (slugs.length === 0) return new Set();
  const found = await db
    .db()
    .collection("gameLocations")
    .find({ slug: { $in: slugs } }, { projection: { slug: 1 } })
    .toArray();
  return new Set(found.map((doc) => String(doc.slug)));
}

/** Un résumé court d'un plan : niveaux et nombre d'éléments. */
export function planOutline(plan: DrawnPlacePlan) {
  return {
    id: plan.id,
    name: plan.name,
    widthCm: plan.widthCm,
    heightCm: plan.heightCm,
    markers: plan.markers.length,
    levels: plan.levels.map((level) => ({
      id: level.id,
      name: level.name,
      rooms: level.rooms.length,
      walls: level.walls.length,
      doors: level.doors.length,
      labels: level.labels.length,
      measures: level.measures.length,
    })),
  };
}
