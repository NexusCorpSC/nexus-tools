import "server-only";

import { ObjectId, type Filter } from "mongodb";
import db from "@/lib/db";
import { organizations } from "@/lib/orgs";
import {
  getPlaceBySlug,
  normalizePlacePosition,
  recomputeSubtree,
} from "@/lib/places";
import { BLOB_HOST } from "@/lib/contribution-store";
import { forgetTarget, shareCounts, sharedWith } from "@/lib/shares";
import {
  MAX_PLACE_NAME_LENGTH,
  type Place,
  type PlacePosition,
} from "@/types/places";
import type { ContributionStatus } from "@/types/contributions";
import {
  MAX_PRIVATE_PLACES,
  MAX_PRIVATE_PLACE_DESCRIPTION_LENGTH,
  isPrivatePlaceType,
  type PrivatePlace,
  type PrivatePlaceInput,
  type PrivatePlaceOrg,
  type PrivatePlaceSummary,
  type PrivatePlaceType,
} from "@/types/private-places";

/**
 * Les lieux privés (voir `types/private-places.ts`). Ils vivent avec le
 * catalogue dans `gameLocations`, marqués par `privacy` : ils héritent de
 * l'arbre (système, corps, chemin) comme les autres, mais toute lecture
 * publique les écarte (`PUBLIC_PLACES` dans `lib/places.ts`), et ils ne
 * comptent ni dans les enfants ni dans les magasins de leur parent.
 *
 * Qui voit quoi se décide à la lecture, jamais par une liste figée : un lieu
 * partagé avec une organisation n'est visible de ses membres que tant que son
 * créateur en fait partie. Le créateur qui la quitte retrouve un lieu « à lui
 * seul » sans que rien ne soit effacé.
 *
 * Son créateur peut aussi l'ouvrir à des joueurs précis, invités par le
 * partage commun (`lib/shares.ts`, `kind: "place"`, le slug pour id) : ils le
 * voient et y rangent leurs objets comme les membres de l'organisation.
 *
 * Chaque lieu privé a sa ligne dans `locations`, la collection où l'inventaire
 * range ses lots : `privatePlaceSlug` la relie à lui. C'est elle que les
 * membres de l'organisation choisissent pour y ranger leurs objets.
 */

type DbPrivatePlace = Place & { privacy: NonNullable<Place["privacy"]> };

export class PrivatePlaceError extends Error {
  constructor(
    public code:
      | "notFound"
      | "forbidden"
      | "invalidInput"
      | "parentNotFound"
      | "notMember"
      | "tooMany",
    public status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const places = () => db.db().collection<Place>("gameLocations");
const locations = () => db.db().collection("locations");
const inventoryItems = () => db.db().collection("inventoryItems");
const contributions = () => db.db().collection("contributions");
const users = () => db.db().collection("users");

const PRIVATE = { privacy: { $exists: true } } as const;

/**
 * Le chemin que `/api/lieux/upload` accorde à l'image d'un lieu privé,
 * suffixe aléatoire compris : à part des galeries publiques.
 */
export const PRIVATE_IMAGE_PATH =
  /^\/prives\/[A-Za-z0-9_-]{1,120}\.(?:jpe?g|png|webp)$/i;

// ─── Qui voit quoi ─────────────────────────────────────────────────────────

export type OrgInfo = {
  id: string;
  name: string;
  tag?: string;
  members: Set<string>;
};

/** Les organisations d'un joueur, et qui en est membre. */
export type Viewer = {
  userId: string;
  orgs: Map<string, OrgInfo>;
  /** Les lieux où un joueur l'a invité, par slug. */
  invited: Set<string>;
};

function toOrgInfo(org: {
  _id: string;
  name: string;
  tag?: string;
  members?: { userId: ObjectId }[];
}): OrgInfo {
  return {
    id: String(org._id),
    name: org.name,
    tag: org.tag || undefined,
    members: new Set(
      (org.members ?? []).map((member) => String(member.userId)),
    ),
  };
}

export async function getViewer(userId: string): Promise<Viewer> {
  const invited = sharedWith("place", userId);
  const found = ObjectId.isValid(userId)
    ? await organizations()
        .find(
          { "members.userId": new ObjectId(userId) },
          { projection: { name: 1, tag: 1, "members.userId": 1 } },
        )
        .sort({ name: 1 })
        .toArray()
    : [];
  return {
    userId,
    orgs: new Map(found.map((org) => [String(org._id), toOrgInfo(org)])),
    invited: new Set((await invited).map((share) => share.targetId)),
  };
}

/**
 * L'organisation qui voit ce lieu, si son créateur en est encore membre. Celle
 * qu'il a quittée ne compte plus, même pour lui.
 */
function effectiveOrg(
  doc: DbPrivatePlace,
  viewer: Viewer,
  cache?: Map<string, OrgInfo | null>,
): Promise<OrgInfo | null> {
  return sharingOrg(doc.privacy, viewer, cache);
}

/**
 * L'organisation avec qui `ownerId` partage quelque chose (`orgId`), telle que
 * `viewer` la voit : seulement si le créateur en est encore membre, et si
 * `viewer` en est membre ou est le créateur. Les marqueurs suivent la même
 * règle (`lib/markers.ts`).
 */
export async function sharingOrg(
  { orgId, ownerId }: { orgId?: string; ownerId: string },
  viewer: Viewer,
  cache: Map<string, OrgInfo | null> = new Map(),
): Promise<OrgInfo | null> {
  if (!orgId) return null;
  // Hors de l'organisation, seul le créateur peut encore le voir.
  if (!viewer.orgs.has(orgId) && viewer.userId !== ownerId) return null;
  let org = viewer.orgs.get(orgId) ?? cache.get(orgId);
  if (org === undefined) {
    // Le créateur peut voir un lieu partagé avec une orga que celui qui lit
    // n'a pas : c'est forcément lui-même, qui l'aurait quittée.
    const found = await organizations().findOne(
      { _id: orgId },
      { projection: { name: 1, tag: 1, "members.userId": 1 } },
    );
    org = found ? toOrgInfo(found) : null;
    cache.set(orgId, org);
  }
  return org && org.members.has(ownerId) ? org : null;
}

/** Ses lieux privés et ceux de ses organisations, avant le contrôle d'appartenance. */
function candidateFilter(viewer: Viewer): Filter<Place> {
  return {
    $or: [
      { "privacy.ownerId": viewer.userId },
      { "privacy.orgId": { $in: [...viewer.orgs.keys()] } },
      { slug: { $in: [...viewer.invited] } },
    ],
  };
}

type Visible = { doc: DbPrivatePlace; org: OrgInfo | null; invited: boolean };

async function visibleDocs(
  viewer: Viewer,
  extra: Filter<Place> = {},
): Promise<Visible[]> {
  const docs = (await places()
    .find(
      { $and: [PRIVATE, candidateFilter(viewer), extra] },
      { projection: { _id: 0, plans: 0 } },
    )
    .sort({ name: 1 })
    .toArray()) as DbPrivatePlace[];
  const cache = new Map<string, OrgInfo | null>();
  const visible: Visible[] = [];
  for (const doc of docs) {
    const org = await effectiveOrg(doc, viewer, cache);
    const invited = viewer.invited.has(doc.slug);
    if (doc.privacy.ownerId === viewer.userId || org || invited) {
      visible.push({ doc, org, invited });
    }
  }
  return visible;
}

/**
 * Les lieux privés qu'un joueur voit sans en être le créateur : ceux de ses
 * organisations et ceux où on l'a invité. Par slug, pour l'inventaire.
 */
export async function sharedPrivatePlaceSlugs(
  userId: string,
): Promise<string[]> {
  const viewer = await getViewer(userId);
  if (viewer.orgs.size === 0 && viewer.invited.size === 0) return [];
  const docs = await visibleDocs(viewer, {
    "privacy.ownerId": { $ne: userId },
  });
  return docs.map(({ doc }) => doc.slug);
}

// ─── Lecture ───────────────────────────────────────────────────────────────

async function proposalsOf(
  docs: DbPrivatePlace[],
): Promise<Map<string, ContributionStatus>> {
  const ids = docs
    .map((doc) => doc.privacy.proposalId)
    .filter((id): id is string => !!id && ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (ids.length === 0) return new Map();
  const found = await contributions()
    .find({ _id: { $in: ids } }, { projection: { status: 1 } })
    .toArray();
  return new Map(
    found.map((entry) => [
      String(entry._id),
      entry.status as ContributionStatus,
    ]),
  );
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

function toOrg(org: OrgInfo | null): PrivatePlaceOrg | undefined {
  if (!org) return undefined;
  const result: PrivatePlaceOrg = {
    id: org.id,
    name: org.name,
    memberCount: org.members.size,
  };
  if (org.tag) result.tag = org.tag;
  return result;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

async function summarize(
  entries: Visible[],
  viewer: Viewer,
): Promise<PrivatePlaceSummary[]> {
  const docs = entries.map((entry) => entry.doc);
  const [statuses, names, guests] = await Promise.all([
    proposalsOf(docs),
    ownerNames(
      docs
        .filter((doc) => doc.privacy.ownerId !== viewer.userId)
        .map((doc) => doc.privacy.ownerId),
    ),
    shareCounts(
      "place",
      docs
        .filter((doc) => doc.privacy.ownerId === viewer.userId)
        .map((doc) => doc.slug),
    ),
  ]);
  return entries.map(({ doc, org, invited }) => {
    const { proposalId, ownerId, locationId } = doc.privacy;
    const status = proposalId ? statuses.get(proposalId) : undefined;
    return withoutUndefined({
      slug: doc.slug,
      name: doc.name,
      type: doc.type as PrivatePlaceType,
      imageUrl: doc.imageUrl,
      parentSlug: doc.parentSlug ?? "",
      parentName: doc.parentName,
      systemSlug: doc.systemSlug,
      systemName: doc.systemName,
      bodySlug: doc.bodySlug,
      bodyName: doc.bodyName,
      position: doc.position,
      org: toOrg(org),
      isOwner: ownerId === viewer.userId,
      ownerName: names.get(ownerId),
      sharedWithMe: ownerId !== viewer.userId && invited ? true : undefined,
      guestCount:
        ownerId === viewer.userId ? (guests.get(doc.slug) ?? 0) : undefined,
      locationId,
      proposal:
        proposalId && status
          ? { contributionId: proposalId, status }
          : undefined,
      createdAt: doc.createdAt ?? "",
      updatedAt: doc.updatedAt ?? "",
    }) as PrivatePlaceSummary;
  });
}

export type PrivatePlaceFilters = {
  query?: string;
  type?: string;
  system?: string;
  body?: string;
  /** Seulement ceux qui ont une position : la Star Map, le NPS. */
  positioned?: boolean;
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Les lieux privés qu'un joueur voit, triés par nom. */
export async function listPrivatePlaces(
  userId: string,
  filters: PrivatePlaceFilters = {},
): Promise<PrivatePlaceSummary[]> {
  const viewer = await getViewer(userId);
  const extra: Filter<Place>[] = [];
  if (filters.type) extra.push({ type: filters.type as Place["type"] });
  if (filters.system) extra.push({ systemSlug: filters.system });
  if (filters.body) extra.push({ bodySlug: filters.body });
  if (filters.positioned) extra.push({ position: { $exists: true } });
  const query = filters.query?.trim();
  if (query) {
    const matcher = { $regex: escapeRegex(query), $options: "i" };
    extra.push({
      $or: [
        { name: matcher },
        { parentName: matcher },
        { systemName: matcher },
        { bodyName: matcher },
      ],
    });
  }
  return summarize(
    await visibleDocs(viewer, extra.length ? { $and: extra } : {}),
    viewer,
  );
}

/** Ceux qu'il a créés, au regard du plafond. */
export async function countOwnedPrivatePlaces(userId: string): Promise<number> {
  return places().countDocuments({ "privacy.ownerId": userId });
}

/** Ses organisations, pour choisir avec qui partager. */
export async function myOrgOptions(userId: string) {
  const viewer = await getViewer(userId);
  return [...viewer.orgs.values()].map((org) =>
    withoutUndefined({ id: org.id, name: org.name, tag: org.tag }),
  );
}

async function findPrivate(slug: string): Promise<DbPrivatePlace | null> {
  return (await places().findOne(
    { slug, ...PRIVATE },
    { projection: { _id: 0, plans: 0 } },
  )) as DbPrivatePlace | null;
}

/** Un lieu privé, s'il le voit. */
export async function getPrivatePlace(
  userId: string,
  slug: string,
): Promise<PrivatePlace | null> {
  const doc = await findPrivate(slug);
  if (!doc) return null;
  const viewer = await getViewer(userId);
  const org = await effectiveOrg(doc, viewer);
  const invited = viewer.invited.has(doc.slug);
  if (doc.privacy.ownerId !== userId && !org && !invited) return null;

  const [summary] = await summarize([{ doc, org, invited }], viewer);
  const ancestors = await places()
    .find(
      { slug: { $in: doc.ancestorSlugs ?? [] } },
      { projection: { _id: 0, slug: 1, name: 1, type: 1 } },
    )
    .toArray();
  const bySlug = new Map(ancestors.map((place) => [place.slug, place]));
  const { imageWidth, imageHeight } = doc.privacy;
  return withoutUndefined({
    ...summary,
    description: doc.description,
    image:
      doc.imageUrl && imageWidth && imageHeight
        ? { url: doc.imageUrl, width: imageWidth, height: imageHeight }
        : undefined,
    ancestors: (doc.ancestorSlugs ?? [])
      .map((ancestor) => bySlug.get(ancestor))
      .filter((ancestor) => !!ancestor)
      .map(({ slug, name, type }) => ({ slug, name, type })),
  }) as PrivatePlace;
}

// ─── Écriture ──────────────────────────────────────────────────────────────

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) {
    throw new PrivatePlaceError("invalidInput", 400, "Texte trop long");
  }
  return trimmed;
}

const MAX_IMAGE_SIDE = 20_000;

function cleanImage(
  input: unknown,
): { url: string; width: number; height: number } | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const raw = input as { url?: unknown; width?: unknown; height?: unknown };
  const value = raw.url;
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (
    typeof value !== "string" ||
    ![width, height].every(
      (side) => Number.isInteger(side) && side > 0 && side <= MAX_IMAGE_SIDE,
    )
  ) {
    throw new PrivatePlaceError("invalidInput", 400, "Image invalide");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PrivatePlaceError("invalidInput", 400, "Image invalide");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== BLOB_HOST ||
    url.port ||
    url.username ||
    url.password ||
    /[?#]/.test(value) ||
    !PRIVATE_IMAGE_PATH.test(url.pathname)
  ) {
    throw new PrivatePlaceError("invalidInput", 400, "Image invalide");
  }
  return { url: value, width, height };
}

type Normalized = {
  name: string;
  type: PrivatePlaceType;
  description?: string;
  image?: { url: string; width: number; height: number };
  parentSlug: string;
  position?: PlacePosition;
  orgId?: string;
};

/**
 * Valide ce que le formulaire envoie : le parent est un lieu public qui peut
 * en contenir d'autres, la position se lit dans son système, l'organisation
 * est une des siennes.
 */
async function normalizeInput(
  input: PrivatePlaceInput,
  viewer: Viewer,
  keepOrgId?: string,
): Promise<Normalized> {
  const raw = (input ?? {}) as Partial<PrivatePlaceInput>;
  const name = cleanText(raw.name, MAX_PLACE_NAME_LENGTH);
  if (!name) {
    throw new PrivatePlaceError("invalidInput", 400, "Le nom est obligatoire");
  }
  if (!isPrivatePlaceType(raw.type)) {
    throw new PrivatePlaceError("invalidInput", 400, "Type invalide");
  }
  if (typeof raw.parentSlug !== "string" || !raw.parentSlug) {
    throw new PrivatePlaceError("parentNotFound", 400);
  }
  // Un lieu public (`getPlaceBySlug` n'en rend pas d'autre) : un lieu privé
  // n'en contient pas d'autre, et un magasin non plus.
  const parent = await getPlaceBySlug(raw.parentSlug);
  if (!parent || parent.type === "shop") {
    throw new PrivatePlaceError("parentNotFound", 400);
  }

  let position: PlacePosition | undefined;
  try {
    position = normalizePlacePosition(raw.position);
  } catch (error) {
    throw new PrivatePlaceError(
      "invalidInput",
      400,
      error instanceof Error ? error.message : undefined,
    );
  }
  if (position?.body) {
    // Comme pour un lieu public : un corps que le NPS sait relire, et du
    // système du parent — chaque système a son repère.
    const body = await getPlaceBySlug(position.body);
    const systemSlug = parent.type === "star" ? parent.slug : parent.systemSlug;
    if (
      !body?.celestial ||
      (systemSlug && body.systemSlug && body.systemSlug !== systemSlug)
    ) {
      throw new PrivatePlaceError(
        "invalidInput",
        400,
        "Corps céleste invalide",
      );
    }
  }

  let orgId: string | undefined;
  if (raw.orgId !== undefined && raw.orgId !== null && raw.orgId !== "") {
    // Une organisation qu'il a quittée reste acceptée si elle ne change pas :
    // elle ne vaut plus rien, mais elle reviendra s'il la rejoint.
    if (
      typeof raw.orgId !== "string" ||
      (!viewer.orgs.has(raw.orgId) && raw.orgId !== keepOrgId)
    ) {
      throw new PrivatePlaceError("notMember", 403);
    }
    orgId = raw.orgId;
  }

  return withoutUndefined({
    name,
    type: raw.type,
    description: cleanText(
      raw.description,
      MAX_PRIVATE_PLACE_DESCRIPTION_LENGTH,
    ),
    image: cleanImage(raw.image),
    parentSlug: parent.slug,
    position,
    orgId,
  }) as Normalized;
}

/**
 * Crée un lieu privé et sa ligne d'inventaire. `fromLocationId` complète un
 * emplacement personnel déjà nommé : ses objets restent où ils sont, la ligne
 * devient celle du lieu. Rend son slug, `prive-` et dix caractères : stable
 * quand il change de nom, jamais celui d'un lieu public.
 */
export async function createPrivatePlace(
  userId: string,
  input: PrivatePlaceInput,
  fromLocationId?: string,
): Promise<string> {
  const viewer = await getViewer(userId);
  const normalized = await normalizeInput(input, viewer);
  if ((await countOwnedPrivatePlaces(userId)) >= MAX_PRIVATE_PLACES) {
    throw new PrivatePlaceError("tooMany", 409);
  }

  const { customAlphabet, nanoid } = await import("nanoid");
  const slug = `prive-${customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10)()}`;

  let locationId: string;
  // Défait la ligne d'inventaire si le lieu ne s'écrit pas.
  let undoLocation: () => Promise<unknown>;
  if (fromLocationId) {
    if (!ObjectId.isValid(fromLocationId)) {
      throw new PrivatePlaceError("notFound", 404);
    }
    // Un emplacement à lui, qui n'est ni du catalogue ni déjà un lieu privé.
    const updated = await locations().findOneAndUpdate(
      {
        _id: new ObjectId(fromLocationId),
        userId,
        placeSlug: { $exists: false },
        privatePlaceSlug: { $exists: false },
      },
      { $set: { name: normalized.name, privatePlaceSlug: slug } },
    );
    if (!updated) throw new PrivatePlaceError("notFound", 404);
    locationId = fromLocationId;
    undoLocation = () =>
      locations().updateOne(
        { _id: updated._id },
        { $set: { name: updated.name }, $unset: { privatePlaceSlug: "" } },
      );
  } else {
    const location = new ObjectId();
    await locations().insertOne({
      _id: location,
      name: normalized.name,
      userId,
      privatePlaceSlug: slug,
    });
    locationId = String(location);
    undoLocation = () => locations().deleteOne({ _id: location });
  }

  const now = new Date().toISOString();
  const { image, orgId, ...fields } = normalized;
  const doc = withoutUndefined({
    ...fields,
    id: nanoid(),
    slug,
    imageUrl: image?.url,
    privacy: withoutUndefined({
      ownerId: userId,
      orgId,
      locationId,
      imageWidth: image?.width,
      imageHeight: image?.height,
    }),
    // Valeurs d'attente : `recomputeSubtree` les remplace juste après.
    ancestorSlugs: [],
    depth: 0,
    path: `/${slug}/`,
    childCount: 0,
    shopCount: 0,
    planCount: 0,
    createdAt: now,
    updatedAt: now,
  }) as Place;
  try {
    await places().insertOne(doc);
  } catch (error) {
    await undoLocation();
    throw error;
  }
  await recomputeSubtree(slug);
  return slug;
}

async function ownedDoc(userId: string, slug: string): Promise<DbPrivatePlace> {
  const doc = await findPrivate(slug);
  if (!doc) throw new PrivatePlaceError("notFound", 404);
  if (doc.privacy.ownerId !== userId) {
    // Un membre ou un invité qui le voit sait qu'il existe ; les autres non.
    const viewer = await getViewer(userId);
    const org = await effectiveOrg(doc, viewer);
    throw org || viewer.invited.has(slug)
      ? new PrivatePlaceError("forbidden", 403)
      : new PrivatePlaceError("notFound", 404);
  }
  return doc;
}

/** Modifie un lieu privé : son créateur seul. */
export async function updatePrivatePlace(
  userId: string,
  slug: string,
  input: PrivatePlaceInput,
): Promise<void> {
  const doc = await ownedDoc(userId, slug);
  const normalized = await normalizeInput(
    input,
    await getViewer(userId),
    doc.privacy.orgId,
  );
  const { image, orgId, ...fields } = normalized;
  const set: Record<string, unknown> = {
    ...fields,
    updatedAt: new Date().toISOString(),
  };
  const unset: Record<string, ""> = {};
  for (const key of ["description", "position"] as const) {
    if (fields[key] === undefined) unset[key] = "";
  }
  if (image) {
    set.imageUrl = image.url;
    set["privacy.imageWidth"] = image.width;
    set["privacy.imageHeight"] = image.height;
  } else {
    unset.imageUrl = "";
    unset["privacy.imageWidth"] = "";
    unset["privacy.imageHeight"] = "";
  }
  if (orgId) set["privacy.orgId"] = orgId;
  else unset["privacy.orgId"] = "";

  await places().updateOne(
    { slug, ...PRIVATE },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
  );
  if (normalized.parentSlug !== doc.parentSlug) await recomputeSubtree(slug);
  if (normalized.name !== doc.name) {
    await locations().updateOne(
      { _id: new ObjectId(doc.privacy.locationId) },
      { $set: { name: normalized.name } },
    );
  }
}

/**
 * Supprime un lieu privé. Rien ne se perd : sa ligne d'inventaire devient un
 * emplacement personnel du créateur, du même nom, et les objets que des
 * membres y avaient rangés passent dans un emplacement personnel à eux.
 */
export async function deletePrivatePlace(
  userId: string,
  slug: string,
): Promise<void> {
  const doc = await ownedDoc(userId, slug);
  const { locationId, ownerId } = doc.privacy;
  const others = (await inventoryItems().distinct("userId", {
    locationId,
    userId: { $ne: ownerId },
  })) as string[];
  for (const other of others) {
    const own = new ObjectId();
    await locations().insertOne({ _id: own, name: doc.name, userId: other });
    await inventoryItems().updateMany(
      { locationId, userId: other },
      { $set: { locationId: String(own) } },
    );
  }
  await locations().updateOne(
    { _id: new ObjectId(locationId) },
    {
      $set: { name: doc.name, userId: ownerId },
      $unset: { privatePlaceSlug: "" },
    },
  );
  await places().deleteOne({ slug, ...PRIVATE });
  await forgetTarget("place", slug);
}

// ─── Passage au public ─────────────────────────────────────────────────────

/** Retient la contribution qui propose ce lieu au public. */
export async function recordProposal(
  slug: string,
  contributionId: ObjectId,
): Promise<void> {
  await places().updateOne(
    { slug, ...PRIVATE },
    { $set: { "privacy.proposalId": String(contributionId) } },
  );
}

/**
 * Sa proposition publiée, le lieu privé cède la place au lieu public : sa
 * ligne d'inventaire devient le reflet du lieu du catalogue — les objets qui
 * y sont rangés, les siens comme ceux des membres, y restent — et il
 * disparaît. Appelé à chaque publication d'un `placeCreate` ; sans lieu privé
 * derrière, ne fait rien.
 */
export async function adoptPublishedPlace(
  contributionId: ObjectId,
  slug: string,
): Promise<void> {
  const doc = (await places().findOne({
    "privacy.proposalId": String(contributionId),
    ...PRIVATE,
  })) as DbPrivatePlace | null;
  if (!doc) return;
  const place = await getPlaceBySlug(slug);
  if (!place) return;
  const { locationId } = doc.privacy;
  // Le catalogue a peut-être déjà son reflet : les lots y vont.
  const mirror = await locations().findOne({ placeSlug: slug });
  if (mirror) {
    await inventoryItems().updateMany(
      { locationId },
      { $set: { locationId: String(mirror._id) } },
    );
    await locations().deleteOne({ _id: new ObjectId(locationId) });
  } else {
    await locations().updateOne(
      { _id: new ObjectId(locationId) },
      {
        $set: {
          name: place.name,
          slug,
          placeSlug: slug,
          ...(place.systemName ? { system: place.systemName } : {}),
        },
        $unset: { userId: "", privatePlaceSlug: "" },
      },
    );
  }
  await places().deleteOne({ slug: doc.slug, ...PRIVATE });
  // Public, il n'a plus d'invités : tout le monde le voit.
  await forgetTarget("place", doc.slug);
}

/** Pour la proposition : le lieu brut, à son créateur seul. */
export async function getOwnedPrivatePlace(
  userId: string,
  slug: string,
): Promise<DbPrivatePlace> {
  return ownedDoc(userId, slug);
}

/** Pour le partage : le lieu, s'il le voit, et s'il en est le créateur. */
export async function placeShareTarget(
  slug: string,
  userId: string,
): Promise<{
  name: string;
  isOwner: boolean;
  org: PrivatePlaceOrg | null;
  /** Une ligne de contexte pour l'invitation : le type et le parent. */
  type: PrivatePlaceType;
  parentName?: string;
} | null> {
  const place = await getPrivatePlace(userId, slug);
  if (!place) return null;
  return {
    name: place.name,
    isOwner: place.isOwner,
    org: place.org ?? null,
    type: place.type,
    parentName: place.parentName,
  };
}

/** Des lieux privés par slug, sans contrôle : décrire des invitations reçues. */
export async function privatePlacesBySlugs(
  slugs: string[],
): Promise<DbPrivatePlace[]> {
  if (slugs.length === 0) return [];
  return (await places()
    .find(
      { slug: { $in: slugs }, ...PRIVATE },
      {
        projection: {
          _id: 0,
          slug: 1,
          name: 1,
          type: 1,
          parentName: 1,
          privacy: 1,
        },
      },
    )
    .toArray()) as DbPrivatePlace[];
}
