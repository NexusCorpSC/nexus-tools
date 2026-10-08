import "server-only";

import { ObjectId, type Filter } from "mongodb";
import db from "@/lib/db";
import type { ListingLocation, ShopItemDbModel } from "@/lib/shop-items";

/**
 * Le stock des annonces et son historique.
 *
 * Une annonce a deux sources de stock possibles :
 * - saisi à la main : le vendeur le corrige depuis le back-office ;
 * - relié à un lot de son inventaire personnel (`inventoryItemId`) : la
 *   quantité et le lieu viennent du lot, et la remise d'une commande fait
 *   baisser le lot. Un plafond (`lotLimit`) peut limiter la part du lot
 *   proposée ; il baisse à chaque remise.
 *
 * Un lot change aussi hors de la marketplace (inventaire, colis, app) : les
 * annonces qui le suivent sont resynchronisées à la lecture
 * (`syncLinkedListings`), avant d'afficher ou de réserver.
 *
 * Chaque changement de stock est écrit dans `shopStockMovements`.
 */

export type StockMovementSource =
  | "manual"
  | "delivery"
  | "lot"
  | "link"
  | "unlink";

export type StockMovementDbModel = {
  _id: ObjectId;
  listingId: string;
  shopId: string;
  listingName: string;
  /** La variation du stock, nulle pour une liaison sans effet. */
  delta: number;
  stockAfter: number;
  source: StockMovementSource;
  note?: string;
  orderId?: string;
  byName?: string;
  at: string;
};

export type StockMovement = Omit<StockMovementDbModel, "_id"> & { id: string };

type LotDbModel = {
  _id: ObjectId;
  name: string;
  quantity: number;
  /** Ce que des colis en attente ont déjà promis. */
  reserved?: number;
  locationId: string;
  userId: string;
};

export type LotSummary = {
  id: string;
  name: string;
  quantity: number;
  location?: ListingLocation;
};

export const MAX_LOT_LIMIT = 1_000_000;

export const MAX_STOCK_NOTE = 200;

function listings() {
  return db.db().collection<ShopItemDbModel>("shopItems");
}

function movements() {
  return db.db().collection<StockMovementDbModel>("shopStockMovements");
}

function lots() {
  return db.db().collection<LotDbModel>("inventoryItems");
}

function toObjectIds(ids: (string | undefined)[]): ObjectId[] {
  return ids
    .filter((id): id is string => !!id && ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
}

/** Ce que le lot peut encore vendre : ni fractions, ni ce que des colis ont promis. */
function lotStock(lot: LotDbModel): number {
  return Math.max(0, Math.floor(lot.quantity - (lot.reserved ?? 0)));
}

/** Ce que l'annonce propose du lot : tout, ou au plus son plafond. */
function cappedStock(lotLeft: number, lotLimit: number | undefined): number {
  return lotLimit === undefined
    ? lotLeft
    : Math.min(lotLeft, Math.max(0, lotLimit));
}

async function locationsById(
  ids: string[],
): Promise<Map<string, ListingLocation>> {
  const objectIds = toObjectIds(ids);
  if (objectIds.length === 0) return new Map();
  const docs = await db
    .db()
    .collection<{ _id: ObjectId; name: string; system?: string }>("locations")
    .find({ _id: { $in: objectIds } }, { projection: { name: 1, system: 1 } })
    .toArray();
  return new Map(
    docs.map((doc) => [
      doc._id.toString(),
      {
        id: doc._id.toString(),
        name: doc.name,
        ...(doc.system && { system: doc.system }),
      },
    ]),
  );
}

export async function recordMovement(
  listing: Pick<ShopItemDbModel, "id" | "shopId" | "name">,
  fields: Omit<
    StockMovementDbModel,
    "_id" | "listingId" | "shopId" | "listingName" | "at"
  >,
): Promise<void> {
  await movements().insertOne({
    _id: new ObjectId(),
    listingId: listing.id,
    shopId: listing.shopId,
    listingName: listing.name,
    ...fields,
    at: new Date().toISOString(),
  });
}

function toMovement({ _id, ...doc }: StockMovementDbModel): StockMovement {
  return { id: _id.toString(), ...doc };
}

export async function getMovements(
  listingId: string,
  limit = 20,
): Promise<StockMovement[]> {
  const docs = await movements()
    .find({ listingId })
    .sort({ at: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toMovement);
}

/** Le dernier mouvement du magasin, sous le tableau des annonces. */
export async function getLastMovementOfShop(
  shopId: string,
): Promise<StockMovement | null> {
  const doc = await movements().findOne({ shopId }, { sort: { at: -1 } });
  return doc ? toMovement(doc) : null;
}

/**
 * Recale le stock et le lieu des annonces reliées à un lot. Un lot disparu
 * ne laisse que ce qui est réservé : rien n'est plus disponible, et les
 * commandes confirmées peuvent encore être remises.
 */
export async function syncLinkedListings(
  filter: Filter<ShopItemDbModel>,
): Promise<void> {
  const linked = await listings()
    .find({ ...filter, inventoryItemId: { $exists: true } })
    .toArray();
  if (linked.length === 0) return;

  const lotDocs = await lots()
    .find({ _id: { $in: toObjectIds(linked.map((l) => l.inventoryItemId)) } })
    .toArray();
  const lotById = new Map(lotDocs.map((lot) => [lot._id.toString(), lot]));
  const places = await locationsById(lotDocs.map((lot) => lot.locationId));

  for (const listing of linked) {
    const lot = lotById.get(listing.inventoryItemId!);
    const reserved = listing.reserved ?? 0;
    const offered = lot ? cappedStock(lotStock(lot), listing.lotLimit) : 0;
    const stock = Math.max(reserved, offered);
    const location = lot ? places.get(lot.locationId) : undefined;
    const missing = !lot;

    const set: Partial<ShopItemDbModel> = {};
    if (stock !== listing.stock) set.stock = stock;
    if (missing !== !!listing.lotMissing) set.lotMissing = missing;
    if (location && location.id !== listing.location?.id) {
      set.location = location;
    }
    if (Object.keys(set).length === 0) continue;

    // Le filtre sur le stock lu évite d'écraser une remise faite entre-temps.
    const result = await listings().updateOne(
      { id: listing.id, stock: listing.stock },
      { $set: set },
    );
    if (result.modifiedCount > 0 && set.stock !== undefined) {
      await recordMovement(listing, {
        delta: stock - listing.stock,
        stockAfter: stock,
        source: "lot",
      });
    }
  }
}

/** Délai minimal entre deux recalages de toutes les annonces reliées. */
const SYNC_ALL_INTERVAL_MS = 60_000;
let lastSyncAll = 0;

/**
 * Recale toutes les annonces reliées, au plus une fois par minute et par
 * instance : la recherche de la marketplace ne peut pas se limiter aux
 * annonces affichées, puisqu'une annonce épuisée dont le lot a été regarni
 * doit y réapparaître. Les pages d'une annonce, le panier et les commandes
 * recalent toujours les annonces qu'ils touchent.
 */
export async function syncAllLinkedListingsThrottled(): Promise<void> {
  const now = Date.now();
  if (now - lastSyncAll < SYNC_ALL_INTERVAL_MS) return;
  lastSyncAll = now;
  await syncLinkedListings({});
}

/** Les lots de l'inventaire d'un joueur qu'une annonce peut suivre. */
export async function searchOwnLots(
  userId: string,
  query: string,
): Promise<LotSummary[]> {
  const text = query.trim();
  const docs = await lots()
    .find({
      userId,
      quantity: { $gte: 1 },
      ...(text && {
        name: {
          $regex: text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        },
      }),
    })
    .sort({ name: 1 })
    .limit(20)
    .toArray();
  const places = await locationsById(docs.map((lot) => lot.locationId));
  return docs.map((lot) => ({
    id: lot._id.toString(),
    name: lot.name,
    quantity: lotStock(lot),
    location: places.get(lot.locationId),
  }));
}

/** Le lot qu'une annonce suit, s'il existe encore. */
export async function getLot(lotId: string): Promise<LotSummary | null> {
  if (!ObjectId.isValid(lotId)) return null;
  const lot = await lots().findOne({ _id: new ObjectId(lotId) });
  if (!lot) return null;
  const places = await locationsById([lot.locationId]);
  return {
    id: lot._id.toString(),
    name: lot.name,
    quantity: lotStock(lot),
    location: places.get(lot.locationId),
  };
}

export type StockError =
  | "INVALID_CHANGE"
  | "NOT_ENOUGH_STOCK"
  | "LINKED"
  | "LOT_NOT_FOUND"
  | "NOT_AN_OBJECT"
  | "ALREADY_ON_SALE"
  | "INVALID_LIMIT"
  | "NOT_LINKED";

/** Corrige à la main le stock d'une annonce qui ne suit pas de lot. */
export async function changeManualStock(
  listing: ShopItemDbModel,
  delta: number,
  { note, byName }: { note?: string; byName: string },
): Promise<{ error?: StockError }> {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
    return { error: "INVALID_CHANGE" };
  }
  if (listing.inventoryItemId) return { error: "LINKED" };

  // Le filtre en base tient même si deux vendeurs corrigent en même temps :
  // ni sous zéro, ni sous ce que des commandes ont réservé.
  const updated = await listings().findOneAndUpdate(
    {
      id: listing.id,
      inventoryItemId: { $exists: false },
      ...(delta < 0 && {
        $expr: {
          $gte: [{ $subtract: ["$stock", { $ifNull: ["$reserved", 0] }] }, -delta],
        },
      }),
    },
    { $inc: { stock: delta } },
    { returnDocument: "after" },
  );
  if (!updated) return { error: "NOT_ENOUGH_STOCK" };

  await recordMovement(listing, {
    delta,
    stockAfter: updated.stock,
    source: "manual",
    byName,
    ...(note?.trim() && { note: note.trim().slice(0, MAX_STOCK_NOTE) }),
  });
  return {};
}

/**
 * Relie l'annonce à un lot de l'inventaire de celui qui la gère : son stock
 * et son lieu suivent désormais le lot.
 */
export async function linkLot(
  listing: ShopItemDbModel,
  lotId: string,
  { userId, byName }: { userId: string; byName: string },
): Promise<{ error?: StockError }> {
  if (listing.type !== "OBJECT") return { error: "NOT_AN_OBJECT" };
  if (!ObjectId.isValid(lotId)) return { error: "LOT_NOT_FOUND" };
  const lot = await lots().findOne({ _id: new ObjectId(lotId), userId });
  if (!lot) return { error: "LOT_NOT_FOUND" };
  if (await isLotOnSaleInShop(lotId, listing.shopId, listing.id)) {
    return { error: "ALREADY_ON_SALE" };
  }

  // Un autre lot repart sans plafond : celui de l'ancien ne vaut plus rien.
  await listings().updateOne(
    { id: listing.id },
    {
      $set: { inventoryItemId: lotId },
      $unset: { lotMissing: "", lotLimit: "" },
    },
  );
  await recordMovement(listing, {
    delta: 0,
    stockAfter: listing.stock,
    source: "link",
    byName,
    note: lot.name,
  });
  await syncLinkedListings({ id: listing.id });
  return {};
}

/**
 * Un lot ne se vend qu'une fois par magasin : deux annonces se
 * partageraient le même stock.
 */
export async function isLotOnSaleInShop(
  lotId: string,
  shopId: string,
  exceptListingId?: string,
): Promise<boolean> {
  const count = await listings().countDocuments({
    inventoryItemId: lotId,
    shopId,
    ...(exceptListingId && { id: { $ne: exceptListingId } }),
  });
  return count > 0;
}

/** Vrai pour un plafond acceptable : un entier d'au moins une unité. */
export function isValidLotLimit(limit: unknown): limit is number {
  return (
    typeof limit === "number" &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= MAX_LOT_LIMIT
  );
}

/**
 * Change le plafond d'une annonce reliée, ou l'enlève (`null`) pour
 * proposer tout le lot. Il ne descend pas sous ce que des commandes
 * réservent déjà.
 */
export async function setLotLimit(
  listing: ShopItemDbModel,
  limit: number | null,
): Promise<{ error?: StockError }> {
  if (!listing.inventoryItemId) return { error: "NOT_LINKED" };
  if (limit !== null && !isValidLotLimit(limit)) {
    return { error: "INVALID_LIMIT" };
  }
  if (limit !== null && limit < (listing.reserved ?? 0)) {
    return { error: "NOT_ENOUGH_STOCK" };
  }
  await listings().updateOne(
    { id: listing.id },
    limit === null ? { $unset: { lotLimit: "" } } : { $set: { lotLimit: limit } },
  );
  await syncLinkedListings({ id: listing.id });
  return {};
}

/** L'annonce ne suit plus son lot : le stock reste tel quel, à corriger à la main. */
export async function unlinkLot(
  listing: ShopItemDbModel,
  { byName }: { byName: string },
): Promise<void> {
  if (!listing.inventoryItemId) return;
  await listings().updateOne(
    { id: listing.id },
    { $unset: { inventoryItemId: "", lotMissing: "", lotLimit: "" } },
  );
  await recordMovement(listing, {
    delta: 0,
    stockAfter: listing.stock,
    source: "unlink",
    byName,
  });
}

/**
 * La remise d'une commande : la réservation devient une sortie de stock, et
 * le lot suivi baisse d'autant. Un lot vidé disparaît de l'inventaire, comme
 * quand le joueur le retire lui-même.
 */
export async function consumeStock(
  lines: { listingId: string; quantity: number }[],
  { orderId, byName }: { orderId: string; byName: string },
): Promise<void> {
  for (const line of lines) {
    const listing = await listings().findOneAndUpdate(
      { id: line.listingId },
      { $inc: { reserved: -line.quantity, stock: -line.quantity } },
      { returnDocument: "after" },
    );
    if (!listing) continue;

    // Ce qui est remis sort aussi du plafond.
    if (listing.lotLimit !== undefined) {
      await listings().updateOne(
        { id: line.listingId, lotLimit: { $exists: true } },
        { $inc: { lotLimit: -line.quantity } },
      );
    }

    if (listing.inventoryItemId && ObjectId.isValid(listing.inventoryItemId)) {
      const lotId = new ObjectId(listing.inventoryItemId);
      const lot = await lots().findOneAndUpdate(
        { _id: lotId },
        {
          $inc: { quantity: -line.quantity },
          $set: { updatedAt: new Date().toISOString() } as Partial<LotDbModel>,
        },
        { returnDocument: "after" },
      );
      if (lot && lot.quantity <= 0) {
        await lots().deleteOne({ _id: lotId, quantity: { $lte: 0 } });
      }
    }

    await recordMovement(listing, {
      delta: -line.quantity,
      stockAfter: listing.stock,
      source: "delivery",
      orderId,
      byName,
    });
  }
}
