import { randomBytes } from "node:crypto";
import { ObjectId } from "bson";
import type { ClientSession } from "mongodb";
import db from "@/lib/db";
import { roundQty } from "@/lib/utils";
import { addInventoryRows } from "@/lib/inventory-quick-add";

/**
 * Parcels: lots handed from one player's inventory to another's by a code.
 *
 * The sender seals a parcel — a snapshot of lots and quantities — and gets an
 * 8-character code to pass on. The recipient types it, sees what is in it,
 * picks where to store it and accepts: the lots leave the sender's inventory
 * and land in the recipient's in one transaction.
 *
 * Until then nothing moves. The quantities are only *reserved*: a second
 * parcel cannot promise them again, and the inventory shows them as such. A
 * lot the sender used up in the meantime makes the delivery fail cleanly
 * rather than hand over what is no longer there.
 */

/** A-Z0-9: 36 characters, 8 places — about 2.8 × 10¹² codes. */
const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const PARCEL_CODE_LENGTH = 8;

/** How long a code can be used. Past it the parcel expires, and nothing moved. */
export const PARCEL_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Most lots in one parcel. */
const PARCEL_MAX_ITEMS = 100;

/** How far back the list of parcels goes. */
const HISTORY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Codes a player may get wrong in `ATTEMPT_WINDOW_MS` before being made to
 * wait: enough for typos, far too few to guess one of 2.8 × 10¹².
 */
const MAX_FAILED_ATTEMPTS = 10;
export const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

/** Below this a quantity is float noise, not stock. */
const EPSILON = 1e-9;

export type ParcelStatus = "pending" | "delivered" | "cancelled" | "expired";

export type ParcelItem = {
  /** The sender's lot the quantity is taken from; not shown to the recipient. */
  itemId: string;
  name: string;
  quality?: number;
  quantity: number;
  unit?: string;
  locationId: string;
  locationName?: string;
};

export type ParcelViewItem = Omit<ParcelItem, "itemId" | "locationId"> &
  Partial<Pick<ParcelItem, "itemId" | "locationId">>;

type DbParcel = {
  _id: ObjectId;
  code: string;
  senderId: string;
  senderName?: string;
  /** Never `expired`: that one is read from `expiresAt`. */
  status: "pending" | "delivered" | "cancelled";
  items: ParcelItem[];
  createdAt: Date;
  expiresAt: Date;
  recipientId?: string;
  recipientName?: string;
  deliveredAt?: Date;
  deliveredLocationId?: string;
  deliveredLocationName?: string;
  cancelledAt?: Date;
};

/** A parcel as the API and the pages show it. */
export type ParcelView = {
  code: string;
  status: ParcelStatus;
  direction: "sent" | "received";
  /** Without `itemId` nor `locationId` for the recipient. */
  items: ParcelViewItem[];
  createdAt: string;
  expiresAt: string;
  senderName?: string;
  recipientName?: string;
  deliveredAt?: string;
  deliveredLocationName?: string;
};

/**
 * Why an operation was refused. The code is stable — the site and the desktop
 * app both turn it into their own message — and `status` is the HTTP answer.
 */
export type ParcelErrorCode =
  | "invalid_code"
  | "invalid_items"
  | "invalid_location"
  | "not_found"
  | "too_many_attempts"
  | "own_parcel"
  | "delivered"
  | "cancelled"
  | "expired"
  | "unavailable";

export class ParcelError extends Error {
  constructor(
    readonly code: ParcelErrorCode,
    readonly status: number,
    /** The lot at fault, for `unavailable` and `invalid_items`. */
    readonly item?: string,
  ) {
    super(item ? `${code}: ${item}` : code);
  }

  toJSON() {
    return { error: this.code, ...(this.item ? { item: this.item } : {}) };
  }
}

const parcels = () => db.db().collection<DbParcel>("parcels");
const attempts = () =>
  db.db().collection<{ userId: string; at: Date }>("parcelCodeAttempts");

/** 256 is not a multiple of 36, so bytes past the last full 36 are skipped. */
function newCode(): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = "";
  while (code.length < PARCEL_CODE_LENGTH) {
    for (const byte of randomBytes(PARCEL_CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === PARCEL_CODE_LENGTH) break;
    }
  }
  return code;
}

/**
 * A code as typed or pasted — lower case, split "K7QM-2X9A", spaced — in the
 * form it is stored, or `null` when it cannot be one.
 */
export function normalizeParcelCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === PARCEL_CODE_LENGTH ? code : null;
}

function statusOf(parcel: DbParcel, now = new Date()): ParcelStatus {
  if (parcel.status === "pending" && parcel.expiresAt <= now) return "expired";
  return parcel.status;
}

function toView(parcel: DbParcel, viewerId: string): ParcelView {
  const direction = parcel.senderId === viewerId ? "sent" : "received";
  return {
    code: parcel.code,
    status: statusOf(parcel),
    direction,
    // The sender's lot and place ids are theirs alone: the recipient gets the
    // names, quantities and qualities.
    items:
      direction === "sent"
        ? parcel.items
        : parcel.items.map((item) => ({
            name: item.name,
            quality: item.quality,
            quantity: item.quantity,
            unit: item.unit,
            locationName: item.locationName,
          })),
    createdAt: parcel.createdAt.toISOString(),
    expiresAt: parcel.expiresAt.toISOString(),
    senderName: parcel.senderName,
    recipientName: parcel.recipientName,
    deliveredAt: parcel.deliveredAt?.toISOString(),
    deliveredLocationName: parcel.deliveredLocationName,
  };
}

/**
 * What the sender's parcels still waiting hold, by lot: the part of each lot
 * already promised, which a new parcel cannot promise again.
 */
export async function reservedQuantities(
  userId: string,
  session?: ClientSession,
): Promise<Map<string, number>> {
  const pending = await parcels()
    .find(
      { senderId: userId, status: "pending", expiresAt: { $gt: new Date() } },
      { projection: { items: 1 }, session },
    )
    .toArray();

  const reserved = new Map<string, number>();
  for (const parcel of pending) {
    for (const item of parcel.items) {
      reserved.set(
        item.itemId,
        roundQty((reserved.get(item.itemId) ?? 0) + item.quantity),
      );
    }
  }
  return reserved;
}

function toObjectId(id: unknown): ObjectId | null {
  return typeof id === "string" && ObjectId.isValid(id)
    ? new ObjectId(id)
    : null;
}

async function locationNames(ids: string[]): Promise<Map<string, string>> {
  const oids = ids.map(toObjectId).filter((id): id is ObjectId => id !== null);
  if (oids.length === 0) return new Map();
  const found = await db
    .db()
    .collection("locations")
    .find({ _id: { $in: oids } }, { projection: { name: 1 } })
    .toArray();
  return new Map(found.map((loc) => [loc._id.toString(), loc.name as string]));
}

/**
 * Seals a parcel from the sender's lots: `entries` is `{ itemId, quantity }[]`,
 * one per lot, quantities in the lot's own unit. Each must be the sender's and
 * hold that much beyond what earlier parcels still waiting already promise.
 */
export async function createParcel(
  sender: { id: string; name?: string },
  entries: unknown,
): Promise<ParcelView> {
  if (
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.length > PARCEL_MAX_ITEMS
  ) {
    throw new ParcelError("invalid_items", 400);
  }

  // The same lot twice is one line of the sum of both.
  const wanted = new Map<string, number>();
  for (const entry of entries as { itemId?: unknown; quantity?: unknown }[]) {
    const id = toObjectId(entry?.itemId);
    const quantity = entry?.quantity;
    if (
      !id ||
      typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      throw new ParcelError("invalid_items", 400);
    }
    const key = id.toString();
    wanted.set(key, roundQty((wanted.get(key) ?? 0) + quantity));
  }

  const lots = await db
    .db()
    .collection("inventoryItems")
    .find({
      _id: { $in: [...wanted.keys()].map((id) => new ObjectId(id)) },
      userId: sender.id,
    })
    .toArray();
  const byId = new Map(lots.map((lot) => [lot._id.toString(), lot]));
  const reserved = await reservedQuantities(sender.id);
  const places = await locationNames(
    lots.map((lot) => lot.locationId as string),
  );

  const items: ParcelItem[] = [];
  for (const [itemId, quantity] of wanted) {
    const lot = byId.get(itemId);
    if (!lot) throw new ParcelError("invalid_items", 400);

    const available = roundQty(
      (lot.quantity as number) - (reserved.get(itemId) ?? 0),
    );
    if (quantity > available + EPSILON) {
      throw new ParcelError("unavailable", 409, lot.name as string);
    }

    items.push({
      itemId,
      name: lot.name as string,
      quality: typeof lot.quality === "number" ? lot.quality : undefined,
      quantity,
      unit: (lot.unit as string | undefined) || undefined,
      locationId: lot.locationId as string,
      locationName: places.get(lot.locationId as string),
    });
  }

  const now = new Date();
  // A taken code is tried again with another; five collisions in a row in a
  // space this size would be something else than bad luck.
  for (let attempt = 0; attempt < 5; attempt++) {
    const parcel: DbParcel = {
      _id: new ObjectId(),
      code: newCode(),
      senderId: sender.id,
      senderName: sender.name,
      status: "pending",
      items,
      createdAt: now,
      expiresAt: new Date(now.getTime() + PARCEL_LIFETIME_MS),
    };
    try {
      await parcels().insertOne(parcel);
      return toView(parcel, sender.id);
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
  }
  throw new Error("No free parcel code found");
}

/** The parcels a player sent or received over the last 30 days, newest first. */
export async function listParcels(userId: string): Promise<ParcelView[]> {
  const since = new Date(Date.now() - HISTORY_MS);
  const found = await parcels()
    .find({
      $or: [{ senderId: userId }, { recipientId: userId }],
      createdAt: { $gte: since },
    })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  return found.map((parcel) => toView(parcel, userId));
}

/**
 * Turns away a player who got too many codes wrong lately. Only failures
 * count: a code found, whatever its state, is not a guess.
 */
async function guardAttempts(userId: string) {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  const failed = await attempts().countDocuments({
    userId,
    at: { $gte: since },
  });
  if (failed >= MAX_FAILED_ATTEMPTS) {
    throw new ParcelError("too_many_attempts", 429);
  }
}

async function recordFailure(userId: string) {
  await attempts().insertOne({ userId, at: new Date() });
}

/** The parcel a code names, for the recipient to look at before accepting. */
async function findForRecipient(
  userId: string,
  rawCode: unknown,
): Promise<DbParcel> {
  await guardAttempts(userId);

  const code = normalizeParcelCode(rawCode);
  if (!code) {
    await recordFailure(userId);
    throw new ParcelError("invalid_code", 400);
  }

  const parcel = await parcels().findOne({ code });
  if (!parcel) {
    await recordFailure(userId);
    throw new ParcelError("not_found", 404);
  }
  if (parcel.senderId === userId) throw new ParcelError("own_parcel", 400);

  const status = statusOf(parcel);
  if (status !== "pending") throw new ParcelError(status, 410);
  return parcel;
}

export async function previewParcel(
  userId: string,
  rawCode: unknown,
): Promise<ParcelView> {
  return toView(await findForRecipient(userId, rawCode), userId);
}

/**
 * Delivers a parcel to the player who typed its code, at the place they
 * picked: taken from the sender's lots and added to the recipient's — topping
 * up a lot already held there, as the quick add does — in one transaction.
 * Either all of it moves, or none of it.
 */
export async function acceptParcel(
  recipient: { id: string; name?: string },
  rawCode: unknown,
  options: { locationId?: unknown; orgVisible?: unknown },
): Promise<{ parcel: ParcelView; created: number; merged: number }> {
  const found = await findForRecipient(recipient.id, rawCode);

  const locationId = toObjectId(options.locationId)?.toString();
  const locationName = locationId
    ? (await locationNames([locationId])).get(locationId)
    : undefined;
  if (!locationId || locationName === undefined) {
    throw new ParcelError("invalid_location", 400);
  }
  const orgVisible = options.orgVisible === true;

  const session = db.startSession();
  try {
    const { parcel, created, merged } = await session.withTransaction(
      async () => {
        const now = new Date();
        // Read again inside the transaction: the one read above only told
        // whether it was worth starting.
        const parcel = await parcels().findOne({ _id: found._id }, { session });
        if (!parcel) throw new ParcelError("not_found", 404);
        const status = statusOf(parcel, now);
        if (status !== "pending") throw new ParcelError(status, 410);

        const inventory = db.db().collection("inventoryItems");
        for (const item of parcel.items) {
          const taken = await inventory.updateOne(
            {
              _id: new ObjectId(item.itemId),
              userId: parcel.senderId,
              quantity: { $gte: item.quantity - EPSILON },
            },
            {
              $inc: { quantity: -item.quantity },
              $set: { updatedAt: now.toISOString() },
            },
            { session },
          );
          if (taken.matchedCount === 0) {
            throw new ParcelError("unavailable", 409, item.name);
          }
        }
        await inventory.deleteMany(
          {
            _id: { $in: parcel.items.map((item) => new ObjectId(item.itemId)) },
            userId: parcel.senderId,
            quantity: { $lte: EPSILON },
          },
          { session },
        );

        const added = await addInventoryRows(
          recipient.id,
          parcel.items.map((item) => ({
            name: item.name,
            quality: item.quality,
            quantity: item.quantity,
            unit: item.unit,
            locationId,
            orgVisible,
          })),
          session,
        );
        if (!added.ok) throw new ParcelError("invalid_items", 400);

        const update = {
          status: "delivered" as const,
          recipientId: recipient.id,
          recipientName: recipient.name,
          deliveredAt: now,
          deliveredLocationId: locationId,
          deliveredLocationName: locationName,
        };
        // Pending in the filter too: a concurrent delivery of the same parcel
        // conflicts here, and only one of the two commits.
        const marked = await parcels().updateOne(
          { _id: parcel._id, status: "pending" },
          { $set: update },
          { session },
        );
        if (marked.matchedCount === 0) throw new ParcelError("delivered", 410);

        return {
          parcel: { ...parcel, ...update },
          created: added.created,
          merged: added.merged,
        };
      },
    );

    return { parcel: toView(parcel, recipient.id), created, merged };
  } finally {
    await session.endSession();
  }
}

/** Takes back a parcel still waiting: its code stops working, nothing moved. */
export async function cancelParcel(
  userId: string,
  rawCode: unknown,
): Promise<ParcelView> {
  const code = normalizeParcelCode(rawCode);
  if (!code) throw new ParcelError("invalid_code", 400);

  const parcel = await parcels().findOneAndUpdate(
    {
      code,
      senderId: userId,
      status: "pending",
      expiresAt: { $gt: new Date() },
    },
    { $set: { status: "cancelled", cancelledAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!parcel) {
    const existing = await parcels().findOne({ code, senderId: userId });
    if (!existing) throw new ParcelError("not_found", 404);
    const status = statusOf(existing);
    throw new ParcelError(status === "pending" ? "not_found" : status, 410);
  }
  return toView(parcel, userId);
}
