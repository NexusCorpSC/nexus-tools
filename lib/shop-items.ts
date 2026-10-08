import "server-only";

import { ObjectId } from "bson";
import db from "@/lib/db";

/** Le lieu de remise d'une annonce, recopié de la collection `locations`. */
export type ListingLocation = {
  id: string;
  name: string;
  system?: string;
};

export type ShopItem = {
  id: string;
  name: string;
  type: "OBJECT" | "SERVICE";
  description: string;
  image: string;
  price: string;
  stock: number;
  createdAt: string;
  /** L'objet du catalogue vendu, quand le vendeur l'a choisi. */
  itemSlug?: string;
  /** Recopiés du catalogue à la création, pour filtrer sans jointure. */
  category?: string;
  manufacturer?: string;
  size?: number;
  /** Où l'objet est remis. */
  location?: ListingLocation;
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
  system?: string;
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

/** Les annonces en stock qui répondent aux filtres de la marketplace. */
export async function searchListings(
  filters: ListingFilters,
  { offset, limit }: { offset: number; limit: number },
): Promise<{ items: ShopItem[]; total: number }> {
  const match: Record<string, unknown> = { stock: { $gte: 1 } };
  const query = filters.query?.trim();
  if (query) match.name = { $regex: escapeRegex(query), $options: "i" };
  if (filters.type) match.type = filters.type;
  if (filters.category) match.category = filters.category;
  if (filters.system) match["location.system"] = filters.system;

  const collection = db.db().collection("shopItems");
  const [items, total] = await Promise.all([
    collection
      .aggregate<ShopItem>([
        { $match: match },
        { $addFields: { priceValue: PRICE_VALUE } },
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
  ]);
  return { items, total };
}

/** Les catégories et systèmes proposés par les annonces en stock. */
export async function getListingFacets(): Promise<{
  categories: string[];
  systems: string[];
}> {
  const collection = db.db().collection("shopItems");
  const [categories, systems] = await Promise.all([
    collection.distinct("category", { stock: { $gte: 1 } }),
    collection.distinct("location.system", { stock: { $gte: 1 } }),
  ]);
  const clean = (values: unknown[]) =>
    values
      .filter((value): value is string => typeof value === "string" && !!value)
      .sort((a, b) => a.localeCompare(b));
  return { categories: clean(categories), systems: clean(systems) };
}

export type ShopSummary = {
  id: string;
  name: string;
  /** Annonces encore en stock. */
  itemCount: number;
};

/** Les magasins, ceux qui ont le plus d'annonces en stock d'abord. */
export async function getShopSummaries(limit: number): Promise<ShopSummary[]> {
  return db
    .db()
    .collection("shops")
    .aggregate<ShopSummary>([
      {
        $lookup: {
          from: "shopItems",
          localField: "id",
          foreignField: "shopId",
          as: "items",
          pipeline: [{ $match: { stock: { $gte: 1 } } }, { $project: { _id: 1 } }],
        },
      },
      { $project: { _id: 0, id: 1, name: 1, itemCount: { $size: "$items" } } },
      { $sort: { itemCount: -1, name: 1 } },
      { $limit: limit },
    ])
    .toArray();
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
    .find({ id: { $in: [...new Set(shopIds)] } }, { projection: { id: 1, name: 1 } })
    .toArray();
  return new Map(shops.map((shop) => [shop.id, shop.name]));
}
