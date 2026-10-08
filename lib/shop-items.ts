import "server-only";

import { ObjectId } from "bson";
import db from "@/lib/db";

/** Le lieu de remise d'une annonce, recopié de la collection `locations`. */
export type ListingLocation = {
  id: string;
  name: string;
  system?: string;
};

/** Ce qui reste à vendre : le stock moins ce que des commandes réservent. */
export const AVAILABLE_STOCK = {
  $subtract: ["$stock", { $ifNull: ["$reserved", 0] }],
};

/** Filtre des annonces qu'on peut encore commander. */
export const IN_STOCK = { $expr: { $gte: [AVAILABLE_STOCK, 1] } };

export type ShopItem = {
  id: string;
  name: string;
  type: "OBJECT" | "SERVICE";
  description: string;
  image: string;
  price: string;
  stock: number;
  /** Quantité réservée par des commandes confirmées. */
  reserved?: number;
  createdAt: string;
  /** L'objet du catalogue vendu, quand le vendeur l'a choisi. */
  itemSlug?: string;
  /** Recopiés du catalogue à la création, pour filtrer sans jointure. */
  category?: string;
  manufacturer?: string;
  size?: number;
  /** Où l'objet est remis. */
  location?: ListingLocation;
  /** Stock moins réservé, calculé par la recherche. */
  available?: number;
  shop: {
    id: string;
    name: string;
  };
};

export type ShopItemDbModel = {
  _id: ObjectId;
  id: string;
  name: string;
  type: "OBJECT" | "SERVICE";
  description: string;
  image: string;
  price: string;
  stock: number;
  /** Quantité réservée par des commandes confirmées. */
  reserved?: number;
  shopId: string;
  createdAt: string;
  /** L'objet du catalogue vendu, quand le vendeur l'a choisi. */
  itemSlug?: string;
  /** Recopiés du catalogue à la création, pour filtrer sans jointure. */
  category?: string;
  manufacturer?: string;
  size?: number;
  /** Où l'objet est remis. */
  location?: ListingLocation;
};

export type Shop = {
  id: string;
  owner: {
    id: ObjectId;
    name: string;
  };
  name: string;
  description: string;
};

export type ShopDbModel = {
  _id: ObjectId;
  id: string;
  ownerId: ObjectId;
  name: string;
  description: string;
  sellers: ObjectId[];
};

export const LISTING_SORTS = ["recent", "priceAsc", "priceDesc"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export type ListingFilters = {
  query?: string;
  type?: "OBJECT" | "SERVICE";
  category?: string;
  /** Un ou plusieurs systèmes de remise. */
  systems?: string[];
  minPrice?: number;
  maxPrice?: number;
  size?: number;
  /** Vrai : les annonces épuisées sont montrées aussi. */
  includeSoldOut?: boolean;
  sort?: ListingSort;
};

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Le prix est parfois un texte dans les anciennes annonces. */
const PRICE_VALUE = {
  $convert: { input: "$price", to: "double", onError: 0, onNull: 0 },
};

const SORT_STAGES: Record<ListingSort, Record<string, 1 | -1>> = {
  recent: { createdAt: -1, id: 1 },
  priceAsc: { priceValue: 1, createdAt: -1, id: 1 },
  priceDesc: { priceValue: -1, createdAt: -1, id: 1 },
};

/** Les annonces qui répondent aux filtres de la marketplace. */
export async function searchListings(
  filters: ListingFilters,
  { offset, limit }: { offset: number; limit: number },
): Promise<{ items: ShopItem[]; total: number; shopCount: number }> {
  const match: Record<string, unknown> = {};
  const exprs: unknown[] = [];
  if (!filters.includeSoldOut) exprs.push(IN_STOCK.$expr);
  if (filters.minPrice !== undefined) {
    exprs.push({ $gte: [PRICE_VALUE, filters.minPrice] });
  }
  if (filters.maxPrice !== undefined) {
    exprs.push({ $lte: [PRICE_VALUE, filters.maxPrice] });
  }
  if (exprs.length > 0) match.$expr = { $and: exprs };
  const query = filters.query?.trim();
  if (query) match.name = { $regex: escapeRegex(query), $options: "i" };
  if (filters.type) match.type = filters.type;
  if (filters.category) match.category = filters.category;
  if (filters.systems?.length) {
    match["location.system"] = { $in: filters.systems };
  }
  if (filters.size !== undefined) match.size = filters.size;

  const collection = db.db().collection("shopItems");
  const [items, total, shopIds] = await Promise.all([
    collection
      .aggregate<ShopItem>([
        { $match: match },
        {
          $addFields: { priceValue: PRICE_VALUE, available: AVAILABLE_STOCK },
        },
        { $sort: SORT_STAGES[filters.sort ?? "recent"] },
        { $skip: offset },
        { $limit: limit },
        {
          $lookup: {
            from: "shops",
            localField: "shopId",
            foreignField: "id",
            as: "shop",
            pipeline: [{ $project: { _id: 0, id: 1, name: 1 } }],
          },
        },
        { $unwind: "$shop" },
      ])
      .toArray(),
    collection.countDocuments(match),
    collection.distinct("shopId", match),
  ]);
  return { items, total, shopCount: shopIds.length };
}

/** Les catégories, systèmes et tailles proposés par les annonces en stock. */
export async function getListingFacets(): Promise<{
  categories: string[];
  systems: string[];
  sizes: number[];
}> {
  const collection = db.db().collection("shopItems");
  const [categories, systems, sizes] = await Promise.all([
    collection.distinct("category", IN_STOCK),
    collection.distinct("location.system", IN_STOCK),
    collection.distinct("size", IN_STOCK),
  ]);
  const clean = (values: unknown[]) =>
    values
      .filter((value): value is string => typeof value === "string" && !!value)
      .sort((a, b) => a.localeCompare(b));
  return {
    categories: clean(categories),
    systems: clean(systems),
    sizes: sizes
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b),
  };
}

export type ShopSummary = {
  id: string;
  name: string;
  /** Annonces encore en stock. */
  itemCount: number;
  /** Le système où le magasin remet le plus souvent. */
  system?: string;
};

/** Les magasins, ceux qui ont le plus d'annonces en stock d'abord. */
export async function getShopSummaries(limit: number): Promise<ShopSummary[]> {
  return db
    .db()
    .collection("shops")
    .aggregate<ShopSummary & { systems?: (string | null)[] }>([
      {
        $lookup: {
          from: "shopItems",
          localField: "id",
          foreignField: "shopId",
          as: "items",
          pipeline: [
            { $match: IN_STOCK },
            { $project: { _id: 0, system: "$location.system" } },
          ],
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          name: 1,
          itemCount: { $size: "$items" },
          systems: "$items.system",
        },
      },
      { $sort: { itemCount: -1, name: 1 } },
      { $limit: limit },
    ])
    .toArray()
    .then((shops) =>
      shops.map(({ systems, ...shop }) => ({
        ...shop,
        system: mostFrequent(systems),
      })),
    );
}

function mostFrequent(values: (string | null | undefined)[] = []) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [value, count] of counts) {
    if (!best || count > counts.get(best)!) best = value;
  }
  return best;
}

export async function getShopItem(itemId: string): Promise<ShopItem | null> {
  return db
    .db()
    .collection("shopItems")
    .aggregate<ShopItem>([
      {
        $match: { id: itemId },
      },
      {
        $lookup: {
          from: "shops",
          localField: "shopId",
          foreignField: "id",
          as: "shop",
          pipeline: [
            {
              $project: {
                id: -1,
                name: -1,
              },
            },
          ],
        },
      },
      {
        $unwind: "$shop",
      },
    ])
    .next();
}

export async function getShopItemsOfShop(
  shopId: string,
  { offset, limit }: { offset: number; limit: number },
): Promise<ShopItemDbModel[]> {
  return db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .find({ shopId })
    .sort({ createdAt: -1, id: 1 })
    .skip(offset)
    .limit(limit)
    .toArray();
}

export async function countShopItems(shopId: string): Promise<number> {
  return db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .countDocuments({ shopId });
}

export async function getShop(shopId: string): Promise<Shop | null> {
  return db
    .db()
    .collection("shops")
    .aggregate<Shop>([
      {
        $match: { id: shopId },
      },
      {
        $lookup: {
          from: "users",
          localField: "ownerId",
          foreignField: "_id",
          as: "owner",
          pipeline: [
            {
              $project: {
                _id: -1,
                name: -1,
              },
            },
          ],
        },
      },
      {
        $unwind: "$owner",
      },
    ])
    .next();
}

export async function getShopSellers(shopId: string): Promise<
  {
    id: string;
    name: string;
  }[]
> {
  const shop = await db
    .db()
    .collection("shops")
    .aggregate<{
      id: string;
      sellers: {
        id: string;
        name: string;
      }[];
    }>([
      {
        $match: { id: shopId },
      },
      {
        $lookup: {
          from: "users",
          localField: "sellers",
          foreignField: "_id",
          as: "sellers",
          pipeline: [
            {
              $project: {
                _id: -1,
                name: -1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          sellers: {
            $map: {
              input: "$sellers",
              as: "seller",
              in: {
                id: {
                  $toString: "$$seller._id",
                },
                name: "$$seller.name",
              },
            },
          },
        },
      },
      {
        $project: {
          "sellers._id": 0,
        },
      },
    ])
    .next();

  if (!shop) {
    throw new Error("Shop not found.");
  }

  return shop.sellers;
}

export async function isUserSellerOfShop(shopId: string, userId: ObjectId) {
  const shop = await db
    .db()
    .collection<ShopDbModel>("shops")
    .findOne({ id: shopId, sellers: userId });

  return !!shop;
}

/** Les noms des magasins, pour les listes qui n'ont que leurs identifiants. */
export async function getShopNames(
  shopIds: string[],
): Promise<Map<string, string>> {
  if (shopIds.length === 0) return new Map();
  const shops = await db
    .db()
    .collection<ShopDbModel>("shops")
    .find(
      { id: { $in: [...new Set(shopIds)] } },
      { projection: { id: 1, name: 1 } },
    )
    .toArray();
  return new Map(shops.map((shop) => [shop.id, shop.name]));
}
