import "server-only";

import { ObjectId, type Filter } from "mongodb";
import db from "@/lib/db";
import { PUBLIC_PLACES, normalizePlacePosition } from "@/lib/places";
import {
  getViewer,
  sharingOrg,
  type OrgInfo,
  type Viewer,
} from "@/lib/private-places";
import type { Place, PlacePosition } from "@/types/places";
import {
  DEFAULT_MARKER_COLOR,
  MARKER_SOURCES,
  MAX_MARKERS,
  MAX_MARKER_COLLECTIONS,
  MAX_MARKER_COLLECTION_NAME_LENGTH,
  MAX_MARKER_NAME_LENGTH,
  MAX_MARKER_NOTE_LENGTH,
  isMarkerColor,
  isMarkerKind,
  type Marker,
  type MarkerCollection,
  type MarkerCollectionInput,
  type MarkerColor,
  type MarkerInput,
  type MarkerKind,
  type MarkerListResponse,
  type MarkerOrg,
  type MarkerSource,
} from "@/types/markers";

/**
 * Les marqueurs (voir `types/markers.ts`) : `markers` garde les points,
 * `markerCollections` leurs dossiers. Un marqueur est à son créateur ; il se
 * partage par sa collection, avec la règle des lieux privés : les membres de
 * l'organisation le voient tant que le créateur en fait partie, et seul le
 * créateur le modifie. Qui voit quoi se décide à la lecture (`sharingOrg`).
 */

export class MarkerError extends Error {
  constructor(
    public code:
      | "notFound"
      | "forbidden"
      | "invalidInput"
      | "notMember"
      | "tooMany",
    public status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

type DbMarker = {
  _id: ObjectId;
  ownerId: string;
  name: string;
  note?: string;
  kind: MarkerKind;
  collectionId?: string;
  systemSlug: string;
  systemName?: string;
  bodySlug?: string;
  bodyName?: string;
  position: PlacePosition;
  source: MarkerSource;
  createdAt: Date;
  updatedAt: Date;
};

type DbCollection = {
  _id: ObjectId;
  ownerId: string;
  name: string;
  color: MarkerColor;
  orgId?: string;
  createdAt: Date;
  updatedAt: Date;
};

const markers = () => db.db().collection<DbMarker>("markers");
const collections = () => db.db().collection<DbCollection>("markerCollections");
const places = () => db.db().collection<Place>("gameLocations");
const users = () => db.db().collection("users");

function toObjectId(id: unknown): ObjectId | null {
  return typeof id === "string" && ObjectId.isValid(id)
    ? new ObjectId(id)
    : null;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function toOrg(org: OrgInfo | null): MarkerOrg | undefined {
  if (!org) return undefined;
  return withoutUndefined({ id: org.id, name: org.name, tag: org.tag });
}

async function ownerNames(ids: string[]): Promise<Map<string, string>> {
  const valid = [...new Set(ids)].filter((id) => ObjectId.isValid(id));
  if (valid.length === 0) return new Map();
  const found = await users()
    .find(
      { _id: { $in: valid.map((id) => new ObjectId(id)) } },
      { projection: { name: 1 } },
    )
    .toArray();
  return new Map(found.map((user) => [String(user._id), user.name as string]));
}

// ─── Qui voit quoi ─────────────────────────────────────────────────────────

type VisibleCollection = { doc: DbCollection; org: OrgInfo | null };

/** Ses collections, et celles que ses organisations voient. */
async function visibleCollections(
  viewer: Viewer,
): Promise<Map<string, VisibleCollection>> {
  const docs = await collections()
    .find({
      $or: [
        { ownerId: viewer.userId },
        { orgId: { $in: [...viewer.orgs.keys()] } },
      ],
    })
    .sort({ name: 1 })
    .toArray();
  const cache = new Map<string, OrgInfo | null>();
  const visible = new Map<string, VisibleCollection>();
  for (const doc of docs) {
    const org = await sharingOrg(doc, viewer, cache);
    if (doc.ownerId === viewer.userId || org) {
      visible.set(String(doc._id), { doc, org });
    }
  }
  return visible;
}

/** Les siens, et ceux des collections partagées avec lui. */
function visibleFilter(
  viewer: Viewer,
  visible: Map<string, VisibleCollection>,
): Filter<DbMarker> {
  const shared = [...visible.entries()]
    .filter(([, entry]) => entry.doc.ownerId !== viewer.userId)
    .map(([id]) => id);
  return shared.length
    ? {
        $or: [{ ownerId: viewer.userId }, { collectionId: { $in: shared } }],
      }
    : { ownerId: viewer.userId };
}

function toMarker(
  doc: DbMarker,
  viewer: Viewer,
  visible: Map<string, VisibleCollection>,
  names: Map<string, string>,
): Marker {
  const collection = doc.collectionId
    ? visible.get(doc.collectionId)
    : undefined;
  return withoutUndefined({
    id: String(doc._id),
    name: doc.name,
    note: doc.note,
    kind: doc.kind,
    collectionId: collection ? doc.collectionId : undefined,
    collectionName: collection?.doc.name,
    color: collection?.doc.color ?? DEFAULT_MARKER_COLOR,
    systemSlug: doc.systemSlug,
    systemName: doc.systemName,
    bodySlug: doc.bodySlug,
    bodyName: doc.bodyName,
    position: doc.position,
    source: doc.source,
    org: toOrg(collection?.org ?? null),
    isOwner: doc.ownerId === viewer.userId,
    ownerName: names.get(doc.ownerId),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }) as Marker;
}

// ─── Lecture ───────────────────────────────────────────────────────────────

export type MarkerFilters = {
  /** L'id d'une collection, ou `none` pour ceux qui n'en ont pas. */
  collection?: string;
  kind?: string;
  /** Le slug d'une planète ou d'une lune. */
  body?: string;
  system?: string;
  query?: string;
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Les marqueurs qu'un joueur voit, du plus récent au plus ancien, avec ses
 * collections, ses organisations et son compte au regard du plafond.
 */
export async function listMarkers(
  userId: string,
  filters: MarkerFilters = {},
): Promise<MarkerListResponse> {
  const viewer = await getViewer(userId);
  const visible = await visibleCollections(viewer);
  const extra: Filter<DbMarker>[] = [];
  if (filters.collection === "none") {
    extra.push({ ownerId: userId, collectionId: { $exists: false } });
  } else if (filters.collection) {
    extra.push({ collectionId: filters.collection });
  }
  if (filters.kind) extra.push({ kind: filters.kind as MarkerKind });
  if (filters.body) extra.push({ bodySlug: filters.body });
  if (filters.system) extra.push({ systemSlug: filters.system });
  const query = filters.query?.trim();
  if (query) {
    const matcher = { $regex: escapeRegex(query), $options: "i" };
    extra.push({
      $or: [{ name: matcher }, { note: matcher }, { bodyName: matcher }],
    });
  }

  const filter = visibleFilter(viewer, visible);
  const [docs, counts, owned] = await Promise.all([
    markers()
      .find(extra.length ? { $and: [filter, ...extra] } : filter)
      .sort({ createdAt: -1 })
      .toArray(),
    // Les comptes par collection ne dépendent pas des filtres : la colonne
    // des collections reste la même pendant qu'on cherche.
    markers()
      .aggregate<{ _id: string | null; count: number }>([
        { $match: filter },
        {
          $group: {
            _id: { $ifNull: ["$collectionId", null] },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    markers().countDocuments({ ownerId: userId }),
  ]);
  const countOf = new Map(counts.map((entry) => [entry._id, entry.count]));

  const owners = [
    ...docs.map((doc) => doc.ownerId),
    ...[...visible.values()].map((entry) => entry.doc.ownerId),
  ].filter((id) => id !== userId);
  const names = await ownerNames(owners);

  return {
    markers: docs.map((doc) => toMarker(doc, viewer, visible, names)),
    collections: [...visible.entries()].map(
      ([id, { doc, org }]) =>
        withoutUndefined({
          id,
          name: doc.name,
          color: doc.color,
          org: toOrg(org),
          isOwner: doc.ownerId === userId,
          ownerName: names.get(doc.ownerId),
          count: countOf.get(id) ?? 0,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
        }) as MarkerCollection,
    ),
    orgs: [...viewer.orgs.values()].map((org) => toOrg(org) as MarkerOrg),
    owned,
  };
}

/** Tous les marqueurs qu'il voit, pour la Star Map et le NPS. */
export async function visibleMarkers(userId: string): Promise<Marker[]> {
  return (await listMarkers(userId)).markers;
}

/** Un marqueur, s'il le voit. */
export async function getMarker(
  userId: string,
  id: string,
): Promise<Marker | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const viewer = await getViewer(userId);
  const visible = await visibleCollections(viewer);
  const doc = await markers().findOne({
    $and: [{ _id }, visibleFilter(viewer, visible)],
  });
  if (!doc) return null;
  const names = await ownerNames(doc.ownerId === userId ? [] : [doc.ownerId]);
  return toMarker(doc, viewer, visible, names);
}

// ─── Écriture ──────────────────────────────────────────────────────────────

function cleanText(
  value: unknown,
  max: number,
  label: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new MarkerError("invalidInput", 400, `${label} invalide`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new MarkerError("invalidInput", 400, `${label} trop long`);
  }
  return trimmed || undefined;
}

type Located = Pick<
  DbMarker,
  "position" | "systemSlug" | "systemName" | "bodySlug" | "bodyName"
>;

/**
 * La position et ce qui la situe : sur un corps, le système est le sien ;
 * dans l'espace, le système doit être donné.
 */
async function locate(raw: MarkerInput): Promise<Located> {
  let position: PlacePosition | undefined;
  try {
    position = normalizePlacePosition(raw.position);
  } catch {
    position = undefined;
  }
  if (!position) {
    throw new MarkerError("invalidInput", 400, "Position invalide");
  }
  if (position.body) {
    const body = await places().findOne(
      { slug: position.body, celestial: { $exists: true }, ...PUBLIC_PLACES },
      { projection: { name: 1, systemSlug: 1, systemName: 1 } },
    );
    if (!body?.systemSlug) {
      throw new MarkerError("invalidInput", 400, "Corps céleste inconnu");
    }
    return withoutUndefined({
      position,
      systemSlug: body.systemSlug,
      systemName: body.systemName,
      bodySlug: position.body,
      bodyName: body.name,
    }) as Located;
  }
  const system =
    typeof raw.systemSlug === "string" && raw.systemSlug
      ? await places().findOne(
          { slug: raw.systemSlug, type: "star", ...PUBLIC_PLACES },
          { projection: { slug: 1, name: 1 } },
        )
      : null;
  if (!system) {
    throw new MarkerError("invalidInput", 400, "Système inconnu");
  }
  return { position, systemSlug: system.slug, systemName: system.name };
}

/** Une collection à lui, ou une erreur ; `null` : sans collection. */
async function ownCollection(
  userId: string,
  id: unknown,
): Promise<string | null> {
  if (id === null || id === undefined || id === "") return null;
  const _id = toObjectId(id);
  const found = _id
    ? await collections().findOne(
        { _id, ownerId: userId },
        { projection: { _id: 1 } },
      )
    : null;
  if (!found) {
    throw new MarkerError("invalidInput", 400, "Collection inconnue");
  }
  return String(found._id);
}

/** Crée un marqueur ; rend son id. */
export async function createMarker(
  userId: string,
  raw: MarkerInput,
): Promise<string> {
  if (!raw || typeof raw !== "object") {
    throw new MarkerError("invalidInput", 400);
  }
  const located = await locate(raw);
  const name =
    cleanText(raw.name, MAX_MARKER_NAME_LENGTH, "Nom") ??
    located.bodyName ??
    located.systemName ??
    located.systemSlug;
  const kind = raw.kind ?? "other";
  if (!isMarkerKind(kind)) {
    throw new MarkerError("invalidInput", 400, "Catégorie invalide");
  }
  const source = raw.source ?? "paste";
  if (!(MARKER_SOURCES as readonly unknown[]).includes(source)) {
    throw new MarkerError("invalidInput", 400, "Source invalide");
  }
  const collectionId = await ownCollection(userId, raw.collectionId);
  if ((await markers().countDocuments({ ownerId: userId })) >= MAX_MARKERS) {
    throw new MarkerError("tooMany", 409);
  }

  const now = new Date();
  const doc = withoutUndefined({
    _id: new ObjectId(),
    ownerId: userId,
    name,
    note: cleanText(raw.note, MAX_MARKER_NOTE_LENGTH, "Note"),
    kind,
    collectionId: collectionId ?? undefined,
    ...located,
    source,
    createdAt: now,
    updatedAt: now,
  }) as DbMarker;
  await markers().insertOne(doc);
  return String(doc._id);
}

async function ownMarker(userId: string, id: string): Promise<DbMarker> {
  const _id = toObjectId(id);
  const doc = _id ? await markers().findOne({ _id }) : null;
  if (!doc) throw new MarkerError("notFound", 404);
  if (doc.ownerId !== userId) {
    // Le voir ne suffit pas : seul son créateur le modifie.
    const visible = await getMarker(userId, id);
    throw visible
      ? new MarkerError("forbidden", 403)
      : new MarkerError("notFound", 404);
  }
  return doc;
}

/** Change ce que `raw` donne ; un champ absent ne change pas. */
export async function updateMarker(
  userId: string,
  id: string,
  raw: MarkerInput,
): Promise<void> {
  if (!raw || typeof raw !== "object") {
    throw new MarkerError("invalidInput", 400);
  }
  const doc = await ownMarker(userId, id);
  const set: Partial<DbMarker> = { updatedAt: new Date() };
  const unset: Record<string, ""> = {};

  if (raw.name !== undefined) {
    const name = cleanText(raw.name, MAX_MARKER_NAME_LENGTH, "Nom");
    if (!name) throw new MarkerError("invalidInput", 400, "Nom obligatoire");
    set.name = name;
  }
  if (raw.note !== undefined) {
    const note = cleanText(raw.note, MAX_MARKER_NOTE_LENGTH, "Note");
    if (note) set.note = note;
    else unset.note = "";
  }
  if (raw.kind !== undefined) {
    if (!isMarkerKind(raw.kind)) {
      throw new MarkerError("invalidInput", 400, "Catégorie invalide");
    }
    set.kind = raw.kind;
  }
  if (raw.collectionId !== undefined) {
    const collectionId = await ownCollection(userId, raw.collectionId);
    if (collectionId) set.collectionId = collectionId;
    else unset.collectionId = "";
  }
  if (raw.position !== undefined) {
    const located = await locate({
      ...raw,
      systemSlug: raw.systemSlug ?? doc.systemSlug,
    });
    Object.assign(set, located);
    if (!located.bodySlug) {
      unset.bodySlug = "";
      unset.bodyName = "";
    }
    if (raw.source !== undefined) {
      if (!(MARKER_SOURCES as readonly unknown[]).includes(raw.source)) {
        throw new MarkerError("invalidInput", 400, "Source invalide");
      }
      set.source = raw.source;
    }
  }

  await markers().updateOne(
    { _id: doc._id },
    Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
  );
}

export async function deleteMarker(userId: string, id: string): Promise<void> {
  const doc = await ownMarker(userId, id);
  await markers().deleteOne({ _id: doc._id });
}

/** Range plusieurs de ses marqueurs dans une collection, ou hors de toute. */
export async function moveMarkers(
  userId: string,
  ids: unknown,
  collectionId: unknown,
): Promise<number> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_MARKERS) {
    throw new MarkerError("invalidInput", 400);
  }
  const objectIds = ids.map(toObjectId);
  if (objectIds.some((entry) => !entry)) {
    throw new MarkerError("invalidInput", 400);
  }
  const target = await ownCollection(userId, collectionId);
  const result = await markers().updateMany(
    { _id: { $in: objectIds as ObjectId[] }, ownerId: userId },
    target
      ? { $set: { collectionId: target, updatedAt: new Date() } }
      : { $unset: { collectionId: "" }, $set: { updatedAt: new Date() } },
  );
  return result.modifiedCount;
}

// ─── Collections ───────────────────────────────────────────────────────────

function cleanCollection(
  raw: MarkerCollectionInput,
  viewer: Viewer,
  keepOrgId?: string,
): Partial<Pick<DbCollection, "name" | "color">> & {
  orgId?: string | null;
} {
  if (!raw || typeof raw !== "object") {
    throw new MarkerError("invalidInput", 400);
  }
  const result: Partial<Pick<DbCollection, "name" | "color">> & {
    orgId?: string | null;
  } = {};
  if (raw.name !== undefined) {
    const name = cleanText(raw.name, MAX_MARKER_COLLECTION_NAME_LENGTH, "Nom");
    if (!name) throw new MarkerError("invalidInput", 400, "Nom obligatoire");
    result.name = name;
  }
  if (raw.color !== undefined) {
    if (!isMarkerColor(raw.color)) {
      throw new MarkerError("invalidInput", 400, "Couleur invalide");
    }
    result.color = raw.color;
  }
  if (raw.orgId !== undefined) {
    if (raw.orgId === null || raw.orgId === "") {
      result.orgId = null;
    } else if (
      typeof raw.orgId === "string" &&
      (viewer.orgs.has(raw.orgId) || raw.orgId === keepOrgId)
    ) {
      // Une organisation qu'il a quittée reste acceptée si elle ne change
      // pas, comme pour les lieux privés.
      result.orgId = raw.orgId;
    } else {
      throw new MarkerError("notMember", 403);
    }
  }
  return result;
}

export async function createMarkerCollection(
  userId: string,
  raw: MarkerCollectionInput,
): Promise<string> {
  const viewer = await getViewer(userId);
  const clean = cleanCollection(raw, viewer);
  if (!clean.name) {
    throw new MarkerError("invalidInput", 400, "Nom obligatoire");
  }
  if (
    (await collections().countDocuments({ ownerId: userId })) >=
    MAX_MARKER_COLLECTIONS
  ) {
    throw new MarkerError("tooMany", 409);
  }
  const now = new Date();
  const doc = withoutUndefined({
    _id: new ObjectId(),
    ownerId: userId,
    name: clean.name,
    color: clean.color ?? DEFAULT_MARKER_COLOR,
    orgId: clean.orgId ?? undefined,
    createdAt: now,
    updatedAt: now,
  }) as DbCollection;
  await collections().insertOne(doc);
  return String(doc._id);
}

async function ownCollectionDoc(
  userId: string,
  id: string,
): Promise<DbCollection> {
  const _id = toObjectId(id);
  const doc = _id ? await collections().findOne({ _id }) : null;
  if (!doc) throw new MarkerError("notFound", 404);
  if (doc.ownerId !== userId) throw new MarkerError("forbidden", 403);
  return doc;
}

export async function updateMarkerCollection(
  userId: string,
  id: string,
  raw: MarkerCollectionInput,
): Promise<void> {
  const doc = await ownCollectionDoc(userId, id);
  const viewer = await getViewer(userId);
  const { orgId, ...clean } = cleanCollection(raw, viewer, doc.orgId);
  const set: Partial<DbCollection> = { ...clean, updatedAt: new Date() };
  if (orgId) set.orgId = orgId;
  await collections().updateOne(
    { _id: doc._id },
    orgId === null ? { $set: set, $unset: { orgId: "" } } : { $set: set },
  );
}

/** Supprime une collection ; ses marqueurs restent, sans collection. */
export async function deleteMarkerCollection(
  userId: string,
  id: string,
): Promise<void> {
  const doc = await ownCollectionDoc(userId, id);
  await markers().updateMany(
    { collectionId: String(doc._id) },
    { $unset: { collectionId: "" }, $set: { updatedAt: new Date() } },
  );
  await collections().deleteOne({ _id: doc._id });
}

/** Les systèmes où poser un marqueur dans l'espace, par nom. */
export async function listMarkerSystems(): Promise<
  { slug: string; name: string }[]
> {
  return places()
    .find(
      { type: "star", ...PUBLIC_PLACES },
      { projection: { _id: 0, slug: 1, name: 1 } },
    )
    .sort({ name: 1 })
    .toArray();
}
