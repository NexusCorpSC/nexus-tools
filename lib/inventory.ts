import db from "@/lib/db";
import { ObjectId } from "bson";
import { reservedQuantities } from "@/lib/parcels";
import { getLotSales } from "@/lib/lot-sales";
import { roundQty } from "@/lib/utils";

export type InventoryFilters = {
  query?: string;
  locationId?: string;
  minQuality?: number;
};

export type InventoryLocation = {
  id: string;
  name: string;
  slug?: string;
  system?: string;
  userId?: string;
  placeSlug?: string;
};

const items = () => db.db().collection("inventoryItems");
const locations = () => db.db().collection("locations");

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * L'inventaire d'un joueur, lot par lot, du plus récemment touché au plus
 * ancien : `GET /api/inventory/items` (site et app) et le serveur MCP.
 * Chaque lot porte ce que des colis en attente en réservent et ses annonces.
 */
export async function listInventory(
  userId: string,
  filters: InventoryFilters = {},
) {
  const matchStage: Record<string, unknown> = { userId };
  if (filters.query) {
    matchStage.name = { $regex: filters.query, $options: "i" };
  }
  if (filters.locationId) matchStage.locationId = filters.locationId;
  if (filters.minQuality !== undefined && !Number.isNaN(filters.minQuality)) {
    matchStage.quality = { $gte: filters.minQuality };
  }

  const docs = await items()
    .aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "locations",
          let: { locationId: "$locationId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$_id" }, "$$locationId"],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "locationData",
        },
      },
      {
        $addFields: {
          location: { $arrayElemAt: ["$locationData", 0] },
        },
      },
      { $unset: "locationData" },
      { $sort: { updatedAt: -1 } },
    ])
    .toArray();

  // What parcels still waiting promise of each lot (`lib/parcels.ts`).
  const reserved = await reservedQuantities(userId);
  // The listings that follow each lot, for the "on sale" badge.
  const sales = await getLotSales(docs.map((item) => item._id.toString()));

  return docs.map((item) => ({
    id: item._id.toString(),
    reserved: reserved.get(item._id.toString()),
    sales: sales.get(item._id.toString()),
    name: item.name as string,
    description: item.description as string | undefined,
    quality: item.quality as number | undefined,
    quantity: item.quantity as number,
    unit: item.unit as string | undefined,
    locationId: item.locationId as string,
    userId: item.userId as string,
    updatedAt: item.updatedAt as string,
    orgVisible: item.orgVisible === true,
    location: item.location
      ? {
          id: item.location._id.toString(),
          name: item.location.name as string,
          slug: item.location.slug as string | undefined,
          system: item.location.system as string | undefined,
          userId: item.location.userId as string | undefined,
        }
      : null,
  }));
}

export type InventoryLot = Awaited<ReturnType<typeof listInventory>>[number];

function toLocation(doc: Record<string, unknown> & { _id: unknown }) {
  return {
    id: String(doc._id),
    name: doc.name as string,
    slug: doc.slug as string | undefined,
    system: doc.system as string | undefined,
    userId: doc.userId as string | undefined,
    placeSlug: doc.placeSlug as string | undefined,
  } satisfies InventoryLocation;
}

/**
 * Les lieux où un joueur peut ranger un lot : ceux de tout le monde (le
 * catalogue d'abord) et les siens. Même ordre que le champ du site.
 */
export async function searchInventoryLocations(
  userId: string,
  query = "",
  limit = 50,
): Promise<InventoryLocation[]> {
  const matchStage: Record<string, unknown> = {
    $or: [{ userId: { $exists: false } }, { userId }],
  };
  if (query) matchStage.name = { $regex: escapeRegex(query), $options: "i" };
  const docs = await locations()
    .aggregate([
      { $match: matchStage },
      {
        $addFields: {
          fromCatalogue: { $cond: [{ $ifNull: ["$placeSlug", false] }, 1, 0] },
        },
      },
      { $sort: { fromCatalogue: -1, name: 1 } },
      { $limit: limit },
    ])
    .toArray();
  return docs.map((doc) => toLocation(doc as never));
}

/**
 * Le lieu qu'un assistant désigne : son identifiant, le slug du lieu du
 * catalogue, ou son nom exact (sans casse). `candidates` liste les lieux
 * proches quand rien ne correspond, ou quand le nom en désigne plusieurs.
 */
export async function resolveInventoryLocation(
  userId: string,
  reference: string,
): Promise<
  | { location: InventoryLocation }
  | { location: null; candidates: InventoryLocation[] }
> {
  const text = reference.trim();
  const visible = { $or: [{ userId: { $exists: false } }, { userId }] };
  if (ObjectId.isValid(text)) {
    const doc = await locations().findOne({
      _id: new ObjectId(text),
      ...visible,
    });
    if (doc) return { location: toLocation(doc) };
  }
  const exact = await locations()
    .find({
      ...visible,
      $and: [
        {
          $or: [
            { placeSlug: text },
            { slug: text },
            { name: { $regex: `^${escapeRegex(text)}$`, $options: "i" } },
          ],
        },
      ],
    })
    .limit(5)
    .toArray();
  if (exact.length === 1) return { location: toLocation(exact[0]) };
  if (exact.length > 1) {
    // Le lieu du catalogue l'emporte sur un lieu homonyme qu'on a nommé soi-même.
    const catalogue = exact.filter((doc) => doc.placeSlug);
    if (catalogue.length === 1) return { location: toLocation(catalogue[0]) };
    return { location: null, candidates: exact.map(toLocation) };
  }
  return {
    location: null,
    candidates: await searchInventoryLocations(userId, text, 8),
  };
}

/** Un lot du joueur, ou `null`. */
export async function getInventoryLot(userId: string, lotId: string) {
  if (!ObjectId.isValid(lotId)) return null;
  return items().findOne({ _id: new ObjectId(lotId), userId });
}

export type LotChanges = {
  name?: string;
  description?: string | null;
  quality?: number | null;
  quantity?: number;
  unit?: string | null;
  locationId?: string;
  orgVisible?: boolean;
};

/**
 * Change un lot du joueur : les mêmes champs que le formulaire du site. Un
 * texte vide efface le champ. Rend le lot à jour, ou `null` s'il n'est pas à
 * lui.
 */
export async function updateInventoryLot(
  userId: string,
  lotId: string,
  changes: LotChanges,
) {
  const lot = await getInventoryLot(userId, lotId);
  if (!lot) return null;

  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  const unset: Record<string, ""> = {};
  const text = (key: string, value: string | null | undefined) => {
    if (value === undefined) return;
    const trimmed = value?.trim();
    if (trimmed) set[key] = trimmed;
    else unset[key] = "";
  };

  if (changes.name !== undefined) {
    if (!changes.name.trim()) throw new Error("name cannot be empty");
    set.name = changes.name.trim();
  }
  text("description", changes.description);
  text("unit", changes.unit);
  if (changes.quality !== undefined) {
    if (changes.quality === null) unset.quality = "";
    else if (!Number.isInteger(changes.quality) || changes.quality < 0) {
      throw new Error("quality must be a non-negative integer");
    } else set.quality = changes.quality;
  }
  if (changes.quantity !== undefined) {
    if (!Number.isFinite(changes.quantity) || changes.quantity < 0) {
      throw new Error("quantity cannot be negative");
    }
    set.quantity = roundQty(changes.quantity);
  }
  if (changes.locationId !== undefined) set.locationId = changes.locationId;
  if (changes.orgVisible !== undefined) set.orgVisible = changes.orgVisible;

  return items().findOneAndUpdate(
    { _id: lot._id, userId },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { returnDocument: "after" },
  );
}

/** Retire un lot de l'inventaire du joueur. */
export async function deleteInventoryLot(
  userId: string,
  lotId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(lotId)) return false;
  const result = await items().deleteOne({ _id: new ObjectId(lotId), userId });
  return result.deletedCount > 0;
}
