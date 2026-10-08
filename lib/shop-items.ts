import "server-only";

import { ObjectId } from "bson";
import db from "@/lib/db";

export type ShopItem = {
  id: string;
  name: string;
  type: "OBJECT" | "SERVICE";
  description: string;
  image: string;
  price: string;
  stock: number;
  createdAt: string;
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

/** Les annonces encore en stock, des plus récentes aux plus anciennes. */
export async function getAvailableItems({
  offset,
  limit,
}: {
  offset: number;
  limit: number;
}): Promise<{ items: ShopItem[]; total: number }> {
  const collection = db.db().collection("shopItems");
  const [items, total] = await Promise.all([
    collection
      .aggregate<ShopItem>([
        { $match: { stock: { $gte: 1 } } },
        { $sort: { createdAt: -1, id: 1 } },
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
    collection.countDocuments({ stock: { $gte: 1 } }),
  ]);
  return { items, total };
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
