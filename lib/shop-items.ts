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

export async function getFeaturedItems(): Promise<ShopItem[]> {
  return db
    .db()
    .collection("shopItems")
    .aggregate<ShopItem>([
      {
        $match: { stock: { $gte: 1 } },
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
      {
        $sort: { createdAt: 1 },
      },
    ])
    .limit(8)
    .toArray();
}

export async function getFeaturedShops(): Promise<Shop[]> {
  return db
    .db()
    .collection("shops")
    .aggregate<Shop>([
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
    .limit(8)
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
    .skip(offset)
    .limit(limit)
    .toArray();
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
