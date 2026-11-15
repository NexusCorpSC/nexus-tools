import "server-only";

import { randomUUID } from "node:crypto";
import { ObjectId } from "bson";
import db from "@/lib/db";
import { friendIdsOf } from "@/lib/friends";
import { getItemBySlug } from "@/lib/items";
import { escapeRegex, visibleLocationsFilter } from "@/lib/inventory";
import { addInventoryRows } from "@/lib/inventory-quick-add";
import { organizations } from "@/lib/orgs";
import { displayUnit, toDisplayQty } from "@/lib/units";
import { roundQty } from "@/lib/utils";
import {
  ACTIVE_OFFER_STATUSES,
  DEFAULT_REQUEST_EXPIRY_DAYS,
  isRequestKind,
  isRequestUnit,
  kindsOfFilter,
  MAX_OFFER_MESSAGE,
  MAX_OFFERS_PER_DAY,
  MAX_OPEN_REQUESTS,
  MAX_REQUEST_NAME,
  MAX_REQUEST_NOTE,
  MAX_REQUEST_ORGS,
  MAX_REQUEST_QUANTITY,
  MAX_UNIT_PRICE,
  OFFER_RULES,
  offerActionsFor,
  quantityLabel,
  REQUEST_EXPIRY_DAYS,
  requestPath,
  type AppRequestsSummary,
  type OfferAction,
  type OfferEntry,
  type OfferRole,
  type OfferStatus,
  type PlayerRequest,
  type RequestAudience,
  type RequestDetail,
  type RequestErrorCode,
  type RequestKind,
  type RequestKindFilter,
  type RequestLocation,
  type RequestNotice,
  type RequestNoticeType,
  type RequestOffer,
  type RequestSupply,
  type RequestUnit,
  type SupplyLot,
} from "@/types/requests";

/**
 * Le tableau des demandes (voir `types/requests.ts`) : les demandes
 * (`playerRequests`), les offres et leurs fils (`requestOffers`), et ce qui
 * mérite d'être signalé à chacun (`requestNotices`, la cloche du site et les
 * notifications de l'app).
 *
 * Le site (pages et routes `/api/requests`), l'app et le serveur MCP passent
 * tous par ici : mêmes règles de visibilité, mêmes limites, même cycle.
 */

// ─── Modèle ──────────────────────────────────────────────────────────────────

export type DbRequest = {
  _id: ObjectId;
  id: string;
  userId: ObjectId;
  userName: string;
  name: string;
  /** Le nom sans casse, pour rapprocher les lots de l'inventaire. */
  nameKey: string;
  itemSlug?: string;
  kind: RequestKind;
  quantity: number;
  unit?: RequestUnit;
  minQuality?: number;
  location?: RequestLocation;
  unitPrice?: number;
  note?: string;
  audience: RequestAudience;
  /** EXPIRED ne s'écrit pas : une demande ouverte dont `expiresAt` est passé. */
  status: "OPEN" | "FILLED" | "CLOSED";
  received: number;
  /** Masquée par la modération (signalements). */
  reportHidden?: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type DbOffer = {
  _id: ObjectId;
  id: string;
  requestId: string;
  /** L'auteur de la demande, pour lister ce qui le concerne sans la relire. */
  requesterId: ObjectId;
  userId: ObjectId;
  userName: string;
  quantity: number;
  quality?: number;
  unitPrice?: number;
  inventoryItemId?: string;
  locationName?: string;
  status: OfferStatus;
  receivedQuantity?: number;
  timeline: OfferEntry[];
  createdAt: Date;
  updatedAt: Date;
};

type DbNotice = {
  _id: ObjectId;
  userId: ObjectId;
  type: RequestNoticeType;
  requestId: string;
  offerId?: string;
  actorName: string;
  summary: string;
  status?: OfferStatus;
  unitPrice?: number;
  excerpt?: string;
  orgName?: string;
  at: Date;
  seenAt?: Date;
};

const requests = () => db.db().collection<DbRequest>("playerRequests");
const offers = () => db.db().collection<DbOffer>("requestOffers");
const notices = () => db.db().collection<DbNotice>("requestNotices");
const users = () =>
  db.db().collection<{
    _id: ObjectId;
    name?: string;
    avatar?: string;
    requestAlertsOff?: boolean;
  }>("users");

export class RequestError extends Error {
  constructor(
    readonly code: RequestErrorCode,
    readonly status: number,
    /** Ce qui ne va pas, en anglais, pour l'assistant et les journaux. */
    readonly detail?: string,
  ) {
    super(detail ?? code);
  }
}

/** Le joueur qui agit : son id et le nom affiché dans les fils. */
export type Actor = { id: ObjectId; name: string };

const DAY_MS = 24 * 60 * 60 * 1000;
/** La plus longue durée proposée : une prolongation n'emmène pas plus loin. */
const MAX_EXPIRY_DAYS = Math.max(...REQUEST_EXPIRY_DAYS);
/** Une demande close reste listée parmi « mes demandes » quelques jours. */
const CLOSED_KEPT_DAYS = 14;
/** Au-delà, une publication ne prévient plus personne : une orga géante. */
const MAX_NOTIFIED = 1000;
/** Les demandes parcourues pour « Je peux fournir », les plus récentes. */
const SUPPLY_SCAN = 300;
const BOARD_LIMIT = 60;

// ─── Qui voit quoi ───────────────────────────────────────────────────────────

type Viewer = {
  id: ObjectId;
  friendIds: ObjectId[];
  orgIds: string[];
};

async function myOrgs(userId: ObjectId): Promise<{ id: string; name: string }[]> {
  const docs = await organizations()
    .find({ "members.userId": userId }, { projection: { name: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs.map((org) => ({ id: org._id, name: org.name }));
}

async function viewerOf(userId: ObjectId): Promise<Viewer> {
  const [friends, orgs] = await Promise.all([
    friendIdsOf(userId),
    myOrgs(userId),
  ]);
  return {
    id: userId,
    friendIds: friends.map((id) => new ObjectId(id)),
    orgIds: orgs.map((org) => org.id),
  };
}

/** Le filtre Mongo des demandes qu'un joueur a le droit de voir. */
function visibleFilter(viewer: Viewer) {
  return {
    $or: [
      { userId: viewer.id },
      {
        reportHidden: { $ne: true },
        $or: [
          { "audience.public": true },
          { "audience.friends": true, userId: { $in: viewer.friendIds } },
          ...(viewer.orgIds.length > 0
            ? [{ "audience.orgIds": { $in: viewer.orgIds } }]
            : []),
        ],
      },
    ],
  };
}

function canSee(doc: DbRequest, viewer: Viewer): boolean {
  if (doc.userId.equals(viewer.id)) return true;
  if (doc.reportHidden) return false;
  if (doc.audience.public) return true;
  if (
    doc.audience.friends &&
    viewer.friendIds.some((id) => id.equals(doc.userId))
  ) {
    return true;
  }
  return doc.audience.orgIds.some((id) => viewer.orgIds.includes(id));
}

/** Une demande publique se lit par son lien, connecté ou non (signalement). */
export async function getRequestForReport(
  id: string,
  viewerId: ObjectId | null,
): Promise<DbRequest | null> {
  const doc = await requests().findOne({ id });
  if (!doc) return null;
  if (viewerId) {
    const viewer = await viewerOf(viewerId);
    return canSee(doc, viewer) ? doc : null;
  }
  return doc.audience.public && !doc.reportHidden ? doc : null;
}

export async function requestExists(id: string): Promise<boolean> {
  return (await requests().countDocuments({ id })) > 0;
}

export async function setRequestReportHidden(id: string, hidden: boolean) {
  await requests().updateOne(
    { id },
    hidden ? { $set: { reportHidden: true } } : { $unset: { reportHidden: "" } },
  );
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

function statusOf(doc: DbRequest, now = Date.now()): PlayerRequest["status"] {
  if (doc.status === "OPEN" && doc.expiresAt.getTime() <= now) return "EXPIRED";
  return doc.status;
}

type Lot = {
  _id: ObjectId;
  name: string;
  quality?: number;
  quantity: number;
  unit?: string;
  locationId: string;
};

/** Ce qu'un lot vaut dans l'unité d'une demande, ou rien s'il ne s'y compte pas. */
function inRequestUnit(lot: Lot, unit: RequestUnit | undefined): number | null {
  const lotShown = displayUnit(lot.unit).unit;
  if (!unit) {
    return lotShown === undefined ? lot.quantity : null;
  }
  if (lotShown !== "SCU") return null;
  const scu = toDisplayQty(lot.quantity, lot.unit);
  return roundQty(unit === "cSCU" ? scu * 100 : scu);
}

async function lotsOf(userId: ObjectId, nameKeys: string[]): Promise<Lot[]> {
  if (nameKeys.length === 0) return [];
  const docs = await db
    .db()
    .collection("inventoryItems")
    .find(
      {
        userId: userId.toHexString(),
        $or: nameKeys.map((key) => ({
          name: { $regex: `^\\s*${escapeRegex(key)}\\s*$`, $options: "i" },
        })),
      },
      {
        projection: {
          name: 1,
          quality: 1,
          quantity: 1,
          unit: 1,
          locationId: 1,
        },
      },
    )
    .limit(500)
    .toArray();
  return docs as unknown as Lot[];
}

async function locationNames(ids: string[]): Promise<Map<string, string>> {
  const valid = [...new Set(ids)].filter((id) => ObjectId.isValid(id));
  if (valid.length === 0) return new Map();
  const docs = await db
    .db()
    .collection("locations")
    .find(
      { _id: { $in: valid.map((id) => new ObjectId(id)) } },
      { projection: { name: 1 } },
    )
    .toArray();
  return new Map(docs.map((doc) => [String(doc._id), doc.name as string]));
}

/** « Vous en avez » : ce que les lots du lecteur couvrent de chaque demande. */
async function supplies(
  viewerId: ObjectId,
  docs: DbRequest[],
): Promise<Map<string, RequestSupply>> {
  const others = docs.filter((doc) => !doc.userId.equals(viewerId));
  const lots = await lotsOf(viewerId, [
    ...new Set(others.map((doc) => doc.nameKey)),
  ]);
  if (lots.length === 0) return new Map();

  const found = new Map<string, { supply: RequestSupply; biggest?: Lot; size: number }>();
  for (const doc of others) {
    let quantity = 0;
    let quality: number | undefined;
    let biggest: Lot | undefined;
    let size = 0;
    for (const lot of lots) {
      if (lot.name.trim().toLowerCase() !== doc.nameKey) continue;
      if (
        doc.minQuality !== undefined &&
        (lot.quality === undefined || lot.quality < doc.minQuality)
      ) {
        continue;
      }
      const amount = inRequestUnit(lot, doc.unit);
      if (amount === null || amount <= 0) continue;
      quantity += amount;
      if (lot.quality !== undefined) quality = Math.max(quality ?? 0, lot.quality);
      if (amount > size) {
        size = amount;
        biggest = lot;
      }
    }
    if (quantity > 0) {
      found.set(doc.id, { supply: { quantity: roundQty(quantity), quality }, biggest, size });
    }
  }
  const names = await locationNames(
    [...found.values()].flatMap((entry) => (entry.biggest ? [entry.biggest.locationId] : [])),
  );
  const result = new Map<string, RequestSupply>();
  for (const [id, entry] of found) {
    result.set(id, {
      ...entry.supply,
      ...(entry.biggest && names.get(entry.biggest.locationId)
        ? { locationName: names.get(entry.biggest.locationId) }
        : {}),
    });
  }
  return result;
}

async function avatarsOf(ids: ObjectId[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const docs = await users()
    .find({ _id: { $in: ids } }, { projection: { avatar: 1 } })
    .toArray();
  return new Map(
    docs.flatMap((doc) => (doc.avatar ? [[String(doc._id), doc.avatar]] : [])),
  );
}

async function orgNamesOf(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const docs = await organizations()
    .find({ _id: { $in: unique } }, { projection: { name: 1 } })
    .toArray();
  return new Map(docs.map((org) => [org._id, org.name]));
}

/** Les demandes en clair pour un lecteur : orgas, avatars, offres, « Vous en avez ». */
async function describe(
  docs: DbRequest[],
  viewerId: ObjectId,
  { withSupply = true }: { withSupply?: boolean } = {},
): Promise<PlayerRequest[]> {
  if (docs.length === 0) return [];
  const ids = docs.map((doc) => doc.id);
  const [orgNames, avatars, active, mine, supply] = await Promise.all([
    orgNamesOf(docs.flatMap((doc) => doc.audience.orgIds)),
    avatarsOf([...new Map(docs.map((doc) => [String(doc.userId), doc.userId])).values()]),
    offers()
      .aggregate<{ _id: string; count: number }>([
        { $match: { requestId: { $in: ids }, status: { $in: ACTIVE_OFFER_STATUSES } } },
        { $group: { _id: "$requestId", count: { $sum: 1 } } },
      ])
      .toArray(),
    offers()
      .find(
        { requestId: { $in: ids }, userId: viewerId },
        { projection: { id: 1, requestId: 1, status: 1, createdAt: 1 } },
      )
      .sort({ createdAt: -1 })
      .toArray(),
    withSupply ? supplies(viewerId, docs) : Promise.resolve(new Map<string, RequestSupply>()),
  ]);
  const activeBy = new Map(active.map((row) => [row._id, row.count]));
  const myOfferBy = new Map<string, { id: string; status: OfferStatus }>();
  for (const offer of mine) {
    // La plus récente, une offre en cours passant devant une offre close.
    const known = myOfferBy.get(offer.requestId);
    if (!known || (!ACTIVE_OFFER_STATUSES.includes(known.status) && ACTIVE_OFFER_STATUSES.includes(offer.status))) {
      myOfferBy.set(offer.requestId, { id: offer.id, status: offer.status });
    }
  }
  const now = Date.now();
  return docs.map((doc) => {
    const mineToo = doc.userId.equals(viewerId);
    // Un lecteur ne voit que les orgas dont il est membre... ou toutes s'il est l'auteur :
    // le nom d'une orga n'est pas un secret, on les montre toutes.
    return {
      id: doc.id,
      userId: String(doc.userId),
      userName: doc.userName,
      ...(avatars.get(String(doc.userId)) && { userAvatar: avatars.get(String(doc.userId)) }),
      name: doc.name,
      ...(doc.itemSlug && { itemSlug: doc.itemSlug }),
      kind: doc.kind,
      quantity: doc.quantity,
      ...(doc.unit && { unit: doc.unit }),
      ...(doc.minQuality !== undefined && { minQuality: doc.minQuality }),
      ...(doc.location && { location: doc.location }),
      ...(doc.unitPrice !== undefined && { unitPrice: doc.unitPrice }),
      ...(doc.note && { note: doc.note }),
      audience: {
        friends: doc.audience.friends,
        public: doc.audience.public,
        orgs: doc.audience.orgIds.flatMap((id) =>
          orgNames.has(id) ? [{ id, name: orgNames.get(id)! }] : [],
        ),
      },
      status: statusOf(doc, now),
      received: doc.received,
      remaining: Math.max(0, roundQty(doc.quantity - doc.received)),
      activeOffers: activeBy.get(doc.id) ?? 0,
      expiresAt: doc.expiresAt.toISOString(),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      mine: mineToo,
      ...(myOfferBy.get(doc.id) && { myOffer: myOfferBy.get(doc.id) }),
      ...(supply.get(doc.id) && { supply: supply.get(doc.id) }),
    } satisfies PlayerRequest;
  });
}

function toOffer(doc: DbOffer, avatars: Map<string, string>): RequestOffer {
  return {
    id: doc.id,
    requestId: doc.requestId,
    userId: String(doc.userId),
    userName: doc.userName,
    ...(avatars.get(String(doc.userId)) && { userAvatar: avatars.get(String(doc.userId)) }),
    quantity: doc.quantity,
    ...(doc.quality !== undefined && { quality: doc.quality }),
    ...(doc.unitPrice !== undefined && { unitPrice: doc.unitPrice }),
    ...(doc.inventoryItemId && { inventoryItemId: doc.inventoryItemId }),
    ...(doc.locationName && { locationName: doc.locationName }),
    status: doc.status,
    ...(doc.receivedQuantity !== undefined && { receivedQuantity: doc.receivedQuantity }),
    timeline: doc.timeline,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export type BoardFilters = {
  q?: string;
  audience?: "friends" | "orgs" | "public";
  kind?: RequestKindFilter;
  system?: string;
  /** Seulement ce que mon inventaire peut couvrir. */
  supply?: boolean;
  offset?: number;
  limit?: number;
};

/**
 * Le tableau : les demandes ouvertes que le lecteur voit, les plus récentes
 * d'abord, avec ses orgas pour les filtres et le formulaire.
 */
export async function listBoard(
  userId: ObjectId,
  filters: BoardFilters = {},
): Promise<{
  requests: PlayerRequest[];
  total: number;
  orgs: { id: string; name: string }[];
}> {
  const viewer = await viewerOf(userId);
  const and: Record<string, unknown>[] = [
    visibleFilter(viewer),
    { status: "OPEN", expiresAt: { $gt: new Date() } },
  ];
  const q = filters.q?.trim();
  if (q) and.push({ name: { $regex: escapeRegex(q), $options: "i" } });
  if (filters.kind) and.push({ kind: { $in: kindsOfFilter(filters.kind) } });
  if (filters.system) and.push({ "location.system": filters.system });
  if (filters.audience === "public") and.push({ "audience.public": true });
  if (filters.audience === "friends") {
    and.push({ "audience.friends": true, userId: { $in: viewer.friendIds } });
  }
  if (filters.audience === "orgs") {
    and.push({ "audience.orgIds": { $in: viewer.orgIds } });
  }
  if (filters.supply) {
    // Les noms que le lecteur détient : le reste du tri se fait en mémoire.
    const held = (await db
      .db()
      .collection("inventoryItems")
      .distinct("name", { userId: userId.toHexString() })) as string[];
    const keys = [...new Set(held.map((name) => name.trim().toLowerCase()))];
    and.push({ nameKey: { $in: keys }, userId: { $ne: userId } });
  }

  const filter = { $and: and };
  const limit = Math.min(Math.max(filters.limit ?? BOARD_LIMIT, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const [docs, total, orgs] = await Promise.all([
    requests()
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      // « Je peux fournir » se filtre en mémoire : on lit depuis le début et
      // le décalage ne s'applique qu'aux demandes couvertes.
      .skip(filters.supply ? 0 : offset)
      .limit(filters.supply ? SUPPLY_SCAN : limit)
      .toArray(),
    filters.supply ? Promise.resolve(0) : requests().countDocuments(filter),
    myOrgs(userId),
  ]);
  let described = await describe(docs, userId);
  if (filters.supply) {
    const covered = described.filter((request) => request.supply);
    return {
      requests: covered.slice(offset, offset + limit),
      total: covered.length,
      orgs,
    };
  }
  described = described.slice(0, limit);
  return { requests: described, total, orgs };
}

/** Les orgas du joueur, pour choisir qui voit une demande. */
export async function listMyOrgs(userId: ObjectId) {
  return myOrgs(userId);
}

/** Mes demandes : ouvertes d'abord, puis celles closes depuis peu. */
export async function listMyRequests(userId: ObjectId): Promise<PlayerRequest[]> {
  const docs = await requests()
    .find({
      userId,
      $or: [
        { status: "OPEN" },
        { updatedAt: { $gt: new Date(Date.now() - CLOSED_KEPT_DAYS * DAY_MS) } },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  const described = await describe(docs, userId, { withSupply: false });
  const rank = (status: PlayerRequest["status"]) => (status === "OPEN" ? 0 : 1);
  return described.sort((a, b) => rank(a.status) - rank(b.status));
}

/** Mes offres, en cours d'abord, avec la demande qu'elles visent. */
export async function listMyOffers(
  userId: ObjectId,
): Promise<(RequestOffer & { request: PlayerRequest })[]> {
  const docs = await offers()
    .find({
      userId,
      $or: [
        { status: { $in: ACTIVE_OFFER_STATUSES } },
        { updatedAt: { $gt: new Date(Date.now() - CLOSED_KEPT_DAYS * DAY_MS) } },
      ],
    })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();
  const requestDocs = await requests()
    .find({ id: { $in: [...new Set(docs.map((doc) => doc.requestId))] } })
    .toArray();
  const described = new Map(
    (await describe(requestDocs, userId, { withSupply: false })).map((request) => [
      request.id,
      request,
    ]),
  );
  const result = docs.flatMap((doc) => {
    const request = described.get(doc.requestId);
    return request ? [{ ...toOffer(doc, new Map()), request }] : [];
  });
  const rank = (status: OfferStatus) => (ACTIVE_OFFER_STATUSES.includes(status) ? 0 : 1);
  return result.sort((a, b) => rank(a.status) - rank(b.status));
}

/** Les lots du lecteur qui portent le nom d'une demande, pour « J'en ai ». */
async function supplyLots(userId: ObjectId, doc: DbRequest): Promise<SupplyLot[]> {
  const lots = await lotsOf(userId, [doc.nameKey]);
  const names = await locationNames(lots.map((lot) => lot.locationId));
  return lots
    .flatMap((lot) => {
      const amount = inRequestUnit(lot, doc.unit);
      if (amount === null || amount <= 0) return [];
      return [
        {
          id: String(lot._id),
          name: lot.name,
          ...(lot.quality !== undefined && { quality: lot.quality }),
          quantity: lot.quantity,
          ...(lot.unit && { unit: lot.unit }),
          inRequestUnit: amount,
          ...(names.get(lot.locationId) && { locationName: names.get(lot.locationId) }),
          belowMinimum:
            doc.minQuality !== undefined &&
            (lot.quality === undefined || lot.quality < doc.minQuality),
        } satisfies SupplyLot,
      ];
    })
    .sort(
      (a, b) =>
        Number(a.belowMinimum) - Number(b.belowMinimum) ||
        (b.quality ?? 0) - (a.quality ?? 0) ||
        b.inRequestUnit - a.inRequestUnit,
    );
}

/** La fiche d'une demande, ou `null` si le lecteur n'a pas à la voir. */
export async function getRequestDetail(
  id: string,
  userId: ObjectId,
): Promise<RequestDetail | null> {
  const doc = await requests().findOne({ id });
  if (!doc) return null;
  const viewer = await viewerOf(userId);
  // Un fournisseur garde l'accès à son offre même si la demande ne lui est plus visible.
  const ownOffers = await offers()
    .find({ requestId: id, ...(doc.userId.equals(userId) ? {} : { userId }) })
    .sort({ createdAt: 1 })
    .toArray();
  if (!canSee(doc, viewer) && ownOffers.length === 0) return null;

  const [described] = await describe([doc], userId);
  const avatars = await avatarsOf(ownOffers.map((offer) => offer.userId));
  return {
    request: described,
    offers: ownOffers.map((offer) => toOffer(offer, avatars)),
    lots: doc.userId.equals(userId) ? [] : await supplyLots(userId, doc),
  };
}

// ─── Saisie ──────────────────────────────────────────────────────────────────

function invalid(detail: string): never {
  throw new RequestError("invalid", 400, detail);
}

function optionalNumber(
  value: unknown,
  field: string,
  { min, max, integer }: { min: number; max: number; integer?: boolean },
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) {
    invalid(`${field} must be a number`);
  }
  if (integer && !Number.isInteger(number)) invalid(`${field} must be a whole number`);
  if (number < min || number > max) invalid(`${field} must be between ${min} and ${max}`);
  return number;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") invalid(`${field} must be text`);
  const text = value.trim();
  if (text.length > max) invalid(`${field} is longer than ${max} characters`);
  return text || undefined;
}

async function resolveLocation(
  userId: ObjectId,
  locationId: unknown,
): Promise<RequestLocation | undefined> {
  if (locationId === undefined || locationId === null || locationId === "") return undefined;
  if (typeof locationId !== "string" || !ObjectId.isValid(locationId)) {
    invalid("unknown location");
  }
  const doc = await db
    .db()
    .collection("locations")
    .findOne({
      _id: new ObjectId(locationId),
      ...(await visibleLocationsFilter(userId.toHexString())),
    });
  if (!doc) invalid("unknown location");
  return {
    id: String(doc._id),
    name: doc.name as string,
    ...(doc.system ? { system: doc.system as string } : {}),
  };
}

/** Une fiche du catalogue par son slug, ou par son nom exact. */
async function catalogItem(
  slug: unknown,
  name: string | undefined,
): Promise<{ slug: string; name: string; kind: RequestKind } | null> {
  if (typeof slug === "string" && slug) {
    const item = await getItemBySlug(slug);
    if (!item) invalid("unknown catalogue item");
    return { slug: item.slug, name: item.name, kind: item.kind };
  }
  if (!name) return null;
  const doc = await db
    .db()
    .collection("gameItems")
    .findOne(
      { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
      { projection: { slug: 1, name: 1, kind: 1 } },
    );
  if (!doc || !isRequestKind(doc.kind)) return null;
  return { slug: doc.slug as string, name: doc.name as string, kind: doc.kind };
}

async function checkAudience(
  userId: ObjectId,
  raw: unknown,
  previous?: RequestAudience,
): Promise<RequestAudience> {
  const value = (raw ?? {}) as Partial<Record<keyof RequestAudience, unknown>>;
  const friends = value.friends === true;
  const isPublic = value.public === true;
  let orgIds = Array.isArray(value.orgIds)
    ? [...new Set(value.orgIds.filter((id): id is string => typeof id === "string" && !!id))]
    : [];
  if (orgIds.length > MAX_REQUEST_ORGS) invalid(`at most ${MAX_REQUEST_ORGS} organizations`);
  if (orgIds.length > 0) {
    const mine = (await myOrgs(userId)).map((org) => org.id);
    // À la modification, une orga quittée depuis la publication est retirée
    // sans erreur : le formulaire la renvoie, mais ne peut pas la décocher.
    const left = orgIds.filter((id) => !mine.includes(id));
    if (left.some((id) => !previous?.orgIds.includes(id))) {
      throw new RequestError("notMember", 403, "you are not a member of every organization given");
    }
    orgIds = orgIds.filter((id) => mine.includes(id));
  }
  if (!friends && !isPublic && orgIds.length === 0) {
    invalid("choose who sees the request: friends, organizations or public");
  }
  return { friends, orgIds, public: isPublic };
}

/**
 * L'unité qu'aura une demande publiée sous ce nom : celle donnée, sinon SCU
 * pour un matériau du catalogue. Pour qu'une confirmation dise la vraie
 * quantité avant d'écrire.
 */
export async function requestUnitFor(
  name: string,
  unit?: RequestUnit | null,
): Promise<RequestUnit | undefined> {
  if (unit) return unit;
  const item = await catalogItem(undefined, name);
  return item?.kind === "resource" ? "SCU" : undefined;
}

/** Ce qu'on saisit pour publier une demande (site, app, MCP). */
export type RequestInput = {
  name?: string;
  itemSlug?: string;
  quantity?: number | string;
  unit?: string | null;
  minQuality?: number | string | null;
  locationId?: string | null;
  unitPrice?: number | string | null;
  note?: string | null;
  audience?: Partial<RequestAudience>;
  expiresInDays?: number;
};

function checkUnitAndQuality(
  kind: RequestKind,
  unitRaw: unknown,
  qualityRaw: unknown,
): { unit?: RequestUnit; minQuality?: number } {
  const material = kind === "resource" || kind === "other";
  let unit: RequestUnit | undefined;
  if (unitRaw !== undefined && unitRaw !== null && unitRaw !== "") {
    if (!isRequestUnit(unitRaw)) invalid("unit must be SCU, cSCU or none");
    if (!material) invalid("only a material is counted in SCU");
    unit = unitRaw;
  } else if (kind === "resource") {
    unit = "SCU";
  }
  const minQuality = optionalNumber(qualityRaw, "minQuality", {
    min: 0,
    max: 1000,
    integer: true,
  });
  if (minQuality !== undefined && !material) invalid("only a material has a quality");
  return { unit, minQuality };
}

// ─── Notifications ───────────────────────────────────────────────────────────

function summaryOf(doc: Pick<DbRequest, "quantity" | "unit" | "name">): string {
  return `${quantityLabel(doc.quantity, doc.unit)} × ${doc.name}`;
}

async function notify(
  userIds: ObjectId[],
  fields: Omit<DbNotice, "_id" | "userId" | "at">,
  { perUser }: { perUser?: (id: ObjectId) => Partial<DbNotice> } = {},
) {
  if (userIds.length === 0) return;
  const at = new Date();
  await notices().insertMany(
    userIds.map((userId) => ({
      _id: new ObjectId(),
      userId,
      at,
      ...fields,
      ...perUser?.(userId),
    })),
  );
}

/** Les amis et les membres des orgas qu'une audience atteint, sans l'auteur. */
async function audienceRecipients(
  authorId: ObjectId,
  audience: RequestAudience,
): Promise<Map<string, { id: ObjectId; orgName?: string }>> {
  const recipients = new Map<string, { id: ObjectId; orgName?: string }>();
  if (audience.friends) {
    for (const id of await friendIdsOf(authorId)) {
      recipients.set(id, { id: new ObjectId(id) });
    }
  }
  if (audience.orgIds.length > 0) {
    const orgs = await organizations()
      .find({ _id: { $in: audience.orgIds } }, { projection: { name: 1, members: 1 } })
      .toArray();
    for (const org of orgs) {
      for (const member of org.members) {
        const key = String(member.userId);
        if (!recipients.has(key)) {
          recipients.set(key, { id: member.userId, orgName: org.name });
        }
      }
    }
  }
  recipients.delete(String(authorId));
  return recipients;
}

/**
 * Prévient les amis et les membres des orgas visées, sauf ceux qui l'ont
 * coupé. Avec `previous` (une audience élargie), seuls les nouveaux venus.
 */
async function announce(doc: DbRequest, previous?: RequestAudience) {
  const recipients = await audienceRecipients(doc.userId, doc.audience);
  if (previous) {
    for (const key of (await audienceRecipients(doc.userId, previous)).keys()) {
      recipients.delete(key);
    }
  }
  if (recipients.size === 0) return;
  const muted = new Set(
    (
      await users()
        .find(
          {
            _id: { $in: [...recipients.values()].map((entry) => entry.id) },
            requestAlertsOff: true,
          },
          { projection: { _id: 1 } },
        )
        .toArray()
    ).map((user) => String(user._id)),
  );
  const targets = [...recipients.values()]
    .filter((entry) => !muted.has(String(entry.id)))
    .slice(0, MAX_NOTIFIED);
  const orgOf = new Map(targets.map((entry) => [String(entry.id), entry.orgName]));
  await notify(
    targets.map((entry) => entry.id),
    {
      type: "request",
      requestId: doc.id,
      actorName: doc.userName,
      summary: summaryOf(doc),
      ...(doc.note && { excerpt: doc.note.slice(0, 140) }),
    },
    {
      perUser: (id) => {
        const orgName = orgOf.get(String(id));
        return orgName ? { orgName } : {};
      },
    },
  );
}

export async function getRequestAlertsOff(userId: ObjectId): Promise<boolean> {
  const user = await users().findOne({ _id: userId }, { projection: { requestAlertsOff: 1 } });
  return user?.requestAlertsOff === true;
}

export async function setRequestAlertsOff(userId: ObjectId, off: boolean) {
  await users().updateOne(
    { _id: userId },
    off ? { $set: { requestAlertsOff: true } } : { $unset: { requestAlertsOff: "" } },
  );
}

function toNotice(doc: DbNotice): RequestNotice {
  return {
    id: String(doc._id),
    type: doc.type,
    requestId: doc.requestId,
    ...(doc.offerId && { offerId: doc.offerId }),
    actorName: doc.actorName,
    summary: doc.summary,
    ...(doc.status && { status: doc.status }),
    ...(doc.unitPrice !== undefined && { unitPrice: doc.unitPrice }),
    ...(doc.excerpt && { excerpt: doc.excerpt }),
    ...(doc.orgName && { orgName: doc.orgName }),
    at: doc.at.toISOString(),
    seen: !!doc.seenAt,
    path: requestPath(doc.requestId, doc.offerId),
  };
}

/** La cloche des demandes : les dernières activités, et combien sont nouvelles. */
export async function listNotices(
  userId: ObjectId,
): Promise<{ notices: RequestNotice[]; unseen: number }> {
  const [docs, unseen] = await Promise.all([
    notices().find({ userId }).sort({ at: -1 }).limit(30).toArray(),
    countUnseenNotices(userId),
  ]);
  return { notices: docs.map(toNotice), unseen };
}

export async function countUnseenNotices(userId: ObjectId): Promise<number> {
  // Suit l'index { userId, seenAt } : seules les non-vues sont parcourues.
  return notices().countDocuments({ userId, seenAt: { $exists: false } });
}

export async function markNoticesSeen(userId: ObjectId) {
  await notices().updateMany(
    { userId, seenAt: { $exists: false } },
    { $set: { seenAt: new Date() } },
  );
}

/** Le délai laissé à une notice pour être écrite avant que l'app la lise. */
const NOTICE_SETTLE_MS = 5_000;
const APP_EVENTS_LIMIT = 50;

/** Ce que l'app lit chaque minute : mes demandes, mes offres, les nouvelles. */
export async function getAppRequests(
  userId: ObjectId,
  since?: string,
): Promise<AppRequestsSummary> {
  // Le repère rendu reste quelques secondes en arrière : une notice datée
  // juste avant la lecture mais pas encore écrite sera lue au tour suivant.
  const cutoff = new Date(Date.now() - NOTICE_SETTLE_MS);
  const sinceDate = since ? new Date(since) : null;
  const [mine, myOffers, events, unseen] = await Promise.all([
    listMyRequests(userId),
    listMyOffers(userId),
    sinceDate && !Number.isNaN(sinceDate.getTime()) && sinceDate < cutoff
      ? notices()
          .find({ userId, at: { $gt: sinceDate, $lte: cutoff } })
          .sort({ at: 1 })
          .limit(APP_EVENTS_LIMIT)
          .toArray()
      : Promise.resolve([]),
    countUnseenNotices(userId),
  ]);
  // Une page pleine : on reprend après la dernière lue, rien n'est sauté.
  const next =
    events.length === APP_EVENTS_LIMIT
      ? events[events.length - 1].at
      : sinceDate && sinceDate > cutoff
        ? sinceDate
        : cutoff;
  return {
    requests: mine,
    offers: myOffers,
    events: events.map(toNotice),
    unseen,
    now: next.toISOString(),
  };
}

// ─── Écriture : demandes ─────────────────────────────────────────────────────

export async function createRequest(
  actor: Actor,
  input: RequestInput,
): Promise<PlayerRequest> {
  const typedName = optionalText(input.name, "name", MAX_REQUEST_NAME);
  const item = await catalogItem(input.itemSlug, typedName);
  const name = item?.name ?? typedName;
  if (!name) invalid("name is required");
  const kind: RequestKind = item?.kind ?? "other";
  const quantity = optionalNumber(input.quantity, "quantity", {
    min: 0.01,
    max: MAX_REQUEST_QUANTITY,
  });
  if (quantity === undefined) invalid("quantity is required");
  const { unit, minQuality } = checkUnitAndQuality(kind, input.unit, input.minQuality);
  if (!unit && !Number.isInteger(quantity)) invalid("a count of objects is a whole number");
  const unitPrice = optionalNumber(input.unitPrice, "unitPrice", {
    min: 0,
    max: MAX_UNIT_PRICE,
  });
  const note = optionalText(input.note, "note", MAX_REQUEST_NOTE);
  const location = await resolveLocation(actor.id, input.locationId);
  const audience = await checkAudience(actor.id, input.audience);
  const days = input.expiresInDays ?? DEFAULT_REQUEST_EXPIRY_DAYS;
  if (!(REQUEST_EXPIRY_DAYS as readonly number[]).includes(days)) {
    invalid(`expiresInDays must be one of ${REQUEST_EXPIRY_DAYS.join(", ")}`);
  }

  await checkOpenLimit(actor.id);

  const now = new Date();
  const doc: DbRequest = {
    _id: new ObjectId(),
    id: randomUUID(),
    userId: actor.id,
    userName: actor.name,
    name,
    nameKey: name.trim().toLowerCase(),
    ...(item && { itemSlug: item.slug }),
    kind,
    quantity: roundQty(quantity),
    ...(unit && { unit }),
    ...(minQuality !== undefined && { minQuality }),
    ...(location && { location }),
    ...(unitPrice !== undefined && { unitPrice }),
    ...(note && { note }),
    audience,
    status: "OPEN",
    received: 0,
    expiresAt: new Date(now.getTime() + days * DAY_MS),
    createdAt: now,
    updatedAt: now,
  };
  await requests().insertOne(doc);
  // Deux publications simultanées passent toutes deux le premier comptage :
  // on recompte une fois écrit, et on retire la sienne si la limite est dépassée.
  try {
    await checkOpenLimit(actor.id, 0);
  } catch (error) {
    await requests().deleteOne({ _id: doc._id });
    throw error;
  }
  await announce(doc);
  const [described] = await describe([doc], actor.id, { withSupply: false });
  return described;
}

/**
 * Refuse une demande ouverte de plus au-delà de MAX_OPEN_REQUESTS. `extra` :
 * celles que l'action ajoute (1 pour une nouvelle ou une réouverture, 0 pour
 * le recomptage après écriture).
 */
async function checkOpenLimit(userId: ObjectId, extra = 1) {
  const open = await requests().countDocuments({
    userId,
    status: "OPEN",
    expiresAt: { $gt: new Date() },
  });
  if (open + extra > MAX_OPEN_REQUESTS) {
    throw new RequestError(
      "tooManyOpen",
      429,
      `at most ${MAX_OPEN_REQUESTS} open requests at once`,
    );
  }
}

/**
 * Les offres encore en cours d'une demande close ou pourvue : déclinées, avec
 * une ligne dans leur fil, et leurs fournisseurs prévenus.
 */
async function settleOffers(request: DbRequest, actorName: string) {
  const active = await offers()
    .find(
      { requestId: request.id, status: { $in: ACTIVE_OFFER_STATUSES } },
      { projection: { id: 1, userId: 1 } },
    )
    .toArray();
  if (active.length === 0) return;
  const now = new Date();
  for (const offer of active) {
    const updated = await offers().updateOne(
      { id: offer.id, status: { $in: ACTIVE_OFFER_STATUSES } },
      {
        $set: { status: "DECLINED", updatedAt: now },
        $push: {
          timeline: entry("requester", actorName, { kind: "status", status: "DECLINED" }),
        },
      },
    );
    if (updated.modifiedCount === 0) continue;
    await notify([offer.userId], {
      type: "status",
      requestId: request.id,
      offerId: offer.id,
      actorName,
      summary: summaryOf(request),
      status: "DECLINED",
    });
  }
}

export type RequestChange =
  | {
      action: "update";
      quantity?: number | string;
      minQuality?: number | string | null;
      locationId?: string | null;
      unitPrice?: number | string | null;
      note?: string | null;
      audience?: Partial<RequestAudience>;
    }
  | { action: "extend"; days: number }
  | { action: "close" };

async function ownRequest(actor: Actor, id: string): Promise<DbRequest> {
  const doc = await requests().findOne({ id });
  if (!doc) throw new RequestError("notFound", 404, "no such request");
  if (!doc.userId.equals(actor.id)) {
    throw new RequestError("notAllowed", 403, "only its author changes a request");
  }
  return doc;
}

/** Modifier, prolonger ou clôturer une de mes demandes. */
export async function changeRequest(
  actor: Actor,
  id: string,
  change: RequestChange,
): Promise<PlayerRequest> {
  const doc = await ownRequest(actor, id);
  const now = new Date();
  const set: Partial<DbRequest> = { updatedAt: now };
  const unset: Record<string, ""> = {};

  let announceFrom: RequestAudience | undefined;
  if (change.action === "close") {
    if (doc.status === "CLOSED") throw new RequestError("closed", 409, "already closed");
    set.status = "CLOSED";
  } else if (change.action === "extend") {
    if (doc.status !== "OPEN") {
      throw new RequestError("closed", 409, "only an open request is extended");
    }
    if (!(REQUEST_EXPIRY_DAYS as readonly number[]).includes(change.days)) {
      invalid(`days must be one of ${REQUEST_EXPIRY_DAYS.join(", ")}`);
    }
    // Rouvrir une demande expirée en ajoute une aux ouvertes.
    if (doc.expiresAt <= now) await checkOpenLimit(actor.id);
    const from = Math.max(now.getTime(), doc.expiresAt.getTime());
    // Jamais plus loin que la plus longue durée proposée.
    const ceiling = now.getTime() + MAX_EXPIRY_DAYS * DAY_MS;
    set.expiresAt = new Date(Math.min(from + change.days * DAY_MS, ceiling));
  } else {
    if (doc.status === "CLOSED") throw new RequestError("closed", 409, "this request is closed");
    if (change.quantity !== undefined) {
      const quantity = optionalNumber(change.quantity, "quantity", {
        min: 0.01,
        max: MAX_REQUEST_QUANTITY,
      });
      if (quantity === undefined) invalid("quantity is required");
      if (!doc.unit && !Number.isInteger(quantity)) invalid("a count of objects is a whole number");
      set.quantity = roundQty(quantity);
      set.status = doc.received >= set.quantity ? "FILLED" : "OPEN";
      // Une demande pourvue qui redemande plus redevient ouverte : elle compte.
      if (doc.status === "FILLED" && set.status === "OPEN" && doc.expiresAt > now) {
        await checkOpenLimit(actor.id);
      }
    }
    if (change.minQuality !== undefined) {
      const { minQuality } = checkUnitAndQuality(doc.kind, doc.unit, change.minQuality);
      if (minQuality === undefined) unset.minQuality = "";
      else set.minQuality = minQuality;
    }
    if (change.locationId !== undefined) {
      const location = await resolveLocation(actor.id, change.locationId);
      if (location) set.location = location;
      else unset.location = "";
    }
    if (change.unitPrice !== undefined) {
      const unitPrice = optionalNumber(change.unitPrice, "unitPrice", {
        min: 0,
        max: MAX_UNIT_PRICE,
      });
      if (unitPrice === undefined) unset.unitPrice = "";
      else set.unitPrice = unitPrice;
    }
    if (change.note !== undefined) {
      const note = optionalText(change.note, "note", MAX_REQUEST_NOTE);
      if (note) set.note = note;
      else unset.note = "";
    }
    if (change.audience !== undefined) {
      set.audience = await checkAudience(actor.id, change.audience, doc.audience);
      announceFrom = doc.audience;
    }
  }

  const updated = await requests().findOneAndUpdate(
    { id, userId: actor.id },
    { $set: set, ...(Object.keys(unset).length > 0 && { $unset: unset }) },
    { returnDocument: "after" },
  );
  if (!updated) throw new RequestError("notFound", 404, "no such request");
  if (updated.status === "CLOSED" || updated.status === "FILLED") {
    await settleOffers(updated, actor.name);
  } else if (announceFrom && statusOf(updated) === "OPEN") {
    // Une audience élargie : les nouveaux venus sont prévenus, eux seuls.
    await announce(updated, announceFrom);
  }
  const [described] = await describe([updated], actor.id, { withSupply: false });
  return described;
}

// ─── Écriture : offres ───────────────────────────────────────────────────────

function entry(
  role: OfferRole,
  authorName: string,
  fields: Omit<OfferEntry, "id" | "at" | "role" | "authorName">,
): OfferEntry {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    role,
    authorName,
    ...fields,
  };
}

export type OfferInput = {
  quantity?: number | string;
  quality?: number | string | null;
  unitPrice?: number | string | null;
  inventoryItemId?: string | null;
  message?: string | null;
};

/** « J'en ai » : une offre sur la demande d'un autre, avec son fil. */
export async function createOffer(
  actor: Actor,
  requestId: string,
  input: OfferInput,
): Promise<RequestOffer> {
  const doc = await requests().findOne({ id: requestId });
  const viewer = await viewerOf(actor.id);
  if (!doc || !canSee(doc, viewer)) {
    throw new RequestError("notFound", 404, "no such request");
  }
  if (doc.userId.equals(actor.id)) {
    throw new RequestError("ownRequest", 400, "you cannot answer your own request");
  }
  if (statusOf(doc) !== "OPEN") {
    throw new RequestError("closed", 409, "this request is no longer open");
  }
  const existing = await offers().countDocuments({
    requestId,
    userId: actor.id,
    status: { $in: ACTIVE_OFFER_STATUSES },
  });
  if (existing > 0) {
    throw new RequestError("alreadyOffered", 409, "you already have an offer on this request");
  }
  await checkOfferLimit(actor.id);

  let quantity = optionalNumber(input.quantity, "quantity", {
    min: 0.01,
    max: MAX_REQUEST_QUANTITY,
  });
  let quality = optionalNumber(input.quality, "quality", { min: 0, max: 1000, integer: true });
  let locationName: string | undefined;
  let inventoryItemId: string | undefined;
  if (input.inventoryItemId) {
    if (!ObjectId.isValid(input.inventoryItemId)) invalid("unknown inventory lot");
    const lot = (await db
      .db()
      .collection("inventoryItems")
      .findOne({
        _id: new ObjectId(input.inventoryItemId),
        userId: actor.id.toHexString(),
      })) as unknown as Lot | null;
    if (!lot) invalid("unknown inventory lot");
    inventoryItemId = String(lot._id);
    quality ??= lot.quality;
    const amount = inRequestUnit(lot, doc.unit);
    if (quantity === undefined && amount !== null) {
      // Le lot entier, sans dépasser ce qui manque encore.
      const remaining = doc.quantity - doc.received;
      quantity = remaining > 0 ? Math.min(amount, remaining) : amount;
    }
    locationName = (await locationNames([lot.locationId])).get(lot.locationId);
  }
  if (quantity === undefined) invalid("quantity is required");
  if (!doc.unit && !Number.isInteger(quantity)) invalid("a count of objects is a whole number");
  const unitPrice =
    optionalNumber(input.unitPrice, "unitPrice", { min: 0, max: MAX_UNIT_PRICE }) ??
    doc.unitPrice;
  const message = optionalText(input.message, "message", MAX_OFFER_MESSAGE);

  const now = new Date();
  const offer: DbOffer = {
    _id: new ObjectId(),
    id: randomUUID(),
    requestId,
    requesterId: doc.userId,
    userId: actor.id,
    userName: actor.name,
    quantity: roundQty(quantity),
    ...(quality !== undefined && { quality }),
    ...(unitPrice !== undefined && { unitPrice }),
    ...(inventoryItemId && { inventoryItemId }),
    ...(locationName && { locationName }),
    status: "NEW",
    timeline: [
      entry("supplier", actor.name, { kind: "status", status: "NEW" }),
      ...(message ? [entry("supplier", actor.name, { kind: "message", body: message })] : []),
    ],
    createdAt: now,
    updatedAt: now,
  };
  try {
    await offers().insertOne(offer);
  } catch (error) {
    // L'index unique partiel { requestId, userId } des offres en cours : une
    // seconde offre envoyée en même temps que la première.
    if (isDuplicateKey(error)) {
      throw new RequestError("alreadyOffered", 409, "you already have an offer on this request");
    }
    throw error;
  }
  // Des offres envoyées en parallèle passent toutes le premier comptage.
  try {
    await checkOfferLimit(actor.id, 0);
  } catch (error) {
    await offers().deleteOne({ _id: offer._id });
    throw error;
  }
  await requests().updateOne({ id: requestId }, { $set: { updatedAt: now } });
  await notify([doc.userId], {
    type: "offer",
    requestId,
    offerId: offer.id,
    actorName: actor.name,
    summary: `${quantityLabel(offer.quantity, doc.unit)} × ${doc.name}`,
    ...(offer.unitPrice !== undefined && { unitPrice: offer.unitPrice }),
    ...(message && { excerpt: message.slice(0, 140) }),
  });
  return toOffer(offer, await avatarsOf([actor.id]));
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 11000;
}

/** Refuse une offre de plus au-delà de MAX_OFFERS_PER_DAY sur 24 heures. */
async function checkOfferLimit(userId: ObjectId, extra = 1) {
  const today = await offers().countDocuments({
    userId,
    createdAt: { $gt: new Date(Date.now() - DAY_MS) },
  });
  if (today + extra > MAX_OFFERS_PER_DAY) {
    throw new RequestError("tooManyOffers", 429, `at most ${MAX_OFFERS_PER_DAY} offers a day`);
  }
}

async function offerWithRole(
  actor: Actor,
  offerId: string,
): Promise<{ offer: DbOffer; request: DbRequest; role: OfferRole }> {
  const offer = await offers().findOne({ id: offerId });
  if (!offer) throw new RequestError("notFound", 404, "no such offer");
  const role: OfferRole | null = offer.requesterId.equals(actor.id)
    ? "requester"
    : offer.userId.equals(actor.id)
      ? "supplier"
      : null;
  if (!role) throw new RequestError("notFound", 404, "no such offer");
  const request = await requests().findOne({ id: offer.requestId });
  if (!request) throw new RequestError("notFound", 404, "the request is gone");
  return { offer, request, role };
}

function otherParty(offer: DbOffer, role: OfferRole): ObjectId {
  return role === "requester" ? offer.userId : offer.requesterId;
}

/** Un message dans le fil d'une offre, de l'un ou l'autre côté. */
export async function postOfferMessage(
  actor: Actor,
  offerId: string,
  body: unknown,
): Promise<RequestOffer> {
  const text = optionalText(body, "message", MAX_OFFER_MESSAGE);
  if (!text) invalid("message is required");
  const { offer, request, role } = await offerWithRole(actor, offerId);
  // Une offre close ne se discute plus : sans quoi un fournisseur décliné
  // pourrait remplir la cloche du demandeur.
  if (!ACTIVE_OFFER_STATUSES.includes(offer.status)) {
    throw new RequestError("closed", 409, "this offer is closed");
  }
  const added = entry(role, actor.name, { kind: "message", body: text });
  const updated = await offers().findOneAndUpdate(
    { id: offerId, status: { $in: ACTIVE_OFFER_STATUSES } },
    { $push: { timeline: added }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new RequestError("closed", 409, "this offer is closed");
  await notify([otherParty(offer, role)], {
    type: "message",
    requestId: request.id,
    offerId,
    actorName: actor.name,
    summary: summaryOf(request),
    excerpt: text.slice(0, 140),
  });
  return toOffer(updated, await avatarsOf([offer.userId]));
}

/** Pour `receive` avec rangement : si l'ajout à l'inventaire a réussi. */
export type InventoryOutcome = { added: boolean; error?: string };

export type OfferActionInput = {
  unitPrice?: number | string;
  /** La quantité reçue, pour `receive` ; l'offre entière par défaut. */
  quantity?: number | string;
  message?: string | null;
  /** Pour `receive` : ranger ce qui est reçu dans mon inventaire, à ce lieu. */
  addToInventory?: { locationId: string } | null;
};

/** Retenir, décliner, marquer reçu, retirer, ou proposer un prix. */
export async function actOnOffer(
  actor: Actor,
  offerId: string,
  action: OfferAction,
  input: OfferActionInput = {},
): Promise<{ offer: RequestOffer; request: PlayerRequest; inventory?: InventoryOutcome }> {
  const { offer, request, role } = await offerWithRole(actor, offerId);
  if (!offerActionsFor(offer.status, role).includes(action)) {
    throw new RequestError("notAllowed", 409, `cannot ${action} this offer now`);
  }
  // Sur une demande close ou pourvue, on ne fait plus que décliner ou retirer ;
  // une demande expirée peut encore recevoir ce qui était convenu, pas retenir.
  const requestStatus = statusOf(request);
  const settled = requestStatus === "CLOSED" || requestStatus === "FILLED";
  if (
    (action === "keep" && requestStatus !== "OPEN") ||
    ((action === "receive" || action === "price") && settled)
  ) {
    throw new RequestError("closed", 409, "this request is no longer open");
  }
  const rule = OFFER_RULES[action];
  const message = optionalText(input.message, "message", MAX_OFFER_MESSAGE);
  const now = new Date();
  const added: OfferEntry[] = [];
  const set: Partial<DbOffer> = { updatedAt: now };
  let received = 0;

  if (action === "price") {
    const unitPrice = optionalNumber(input.unitPrice, "unitPrice", {
      min: 0,
      max: MAX_UNIT_PRICE,
    });
    if (unitPrice === undefined) invalid("unitPrice is required");
    set.unitPrice = unitPrice;
    added.push(entry(role, actor.name, { kind: "price", unitPrice, body: message }));
  } else {
    if (action === "receive") {
      // Jamais plus que l'offre : une faute de frappe ne pourvoit pas la demande.
      received =
        optionalNumber(input.quantity, "quantity", {
          min: 0.01,
          max: offer.quantity,
        }) ?? offer.quantity;
      if (!request.unit && !Number.isInteger(received)) {
        invalid("a count of objects is a whole number");
      }
      received = roundQty(received);
      set.receivedQuantity = received;
    }
    set.status = rule.to!;
    added.push(
      entry(role, actor.name, {
        kind: "status",
        status: rule.to!,
        ...(action === "receive" && { quantity: received }),
      }),
    );
    if (message) added.push(entry(role, actor.name, { kind: "message", body: message }));
  }

  // Ranger dans l'inventaire avant d'écrire : un lieu refusé ne laisse rien à moitié.
  let inventoryRow: Parameters<typeof addInventoryRows>[1] | null = null;
  if (action === "receive" && input.addToInventory?.locationId) {
    const location = await resolveLocation(actor.id, input.addToInventory.locationId);
    if (!location) invalid("unknown location");
    inventoryRow = [
      {
        name: request.name,
        ...(offer.quality !== undefined && { quality: offer.quality }),
        quantity: received,
        ...(request.unit && { unit: request.unit }),
        locationId: location.id,
        orgVisible: false,
      },
    ];
  }

  const updated = await offers().findOneAndUpdate(
    { id: offerId, status: { $in: rule.from } },
    { $set: set, $push: { timeline: { $each: added } } },
    { returnDocument: "after" },
  );
  if (!updated) throw new RequestError("notAllowed", 409, "the offer changed meanwhile");

  let requestDoc = request;
  let inventory: InventoryOutcome | undefined;
  if (action === "receive") {
    const after = await requests().findOneAndUpdate(
      { id: request.id },
      { $inc: { received }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    if (after) {
      requestDoc = after;
      if (after.status === "OPEN" && after.received >= after.quantity) {
        await requests().updateOne({ id: request.id, status: "OPEN" }, { $set: { status: "FILLED" } });
        requestDoc = { ...after, status: "FILLED" };
      }
    }
    if (inventoryRow) {
      // L'offre est déjà reçue : un échec ici est dit au joueur, qui range à la main.
      const result = await addInventoryRows(actor.id.toHexString(), inventoryRow);
      if (result.ok) {
        inventory = { added: true };
      } else {
        console.error("cannot add a received request to the inventory", result.error);
        inventory = { added: false, error: String(result.error ?? "unknown") };
      }
    }
  }

  await notify([otherParty(offer, role)], {
    type: action === "price" ? "price" : "status",
    requestId: request.id,
    offerId,
    actorName: actor.name,
    summary: summaryOf(request),
    ...(set.status && { status: set.status }),
    ...(set.unitPrice !== undefined && { unitPrice: set.unitPrice }),
    ...(message && { excerpt: message.slice(0, 140) }),
  });

  if (requestDoc.status === "FILLED" && request.status !== "FILLED") {
    // Tout est reçu : les autres offres en cours n'ont plus d'objet.
    await settleOffers(requestDoc, actor.name);
  }

  const [described] = await describe([requestDoc], actor.id, { withSupply: false });
  return {
    offer: toOffer(updated, await avatarsOf([offer.userId])),
    request: described,
    ...(inventory && { inventory }),
  };
}
