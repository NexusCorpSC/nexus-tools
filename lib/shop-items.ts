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
  createdAt: string;
  shop: {
    id: string;
    name: string;
  };
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

export async function getFeaturedItems(): Promise<ShopItem[]> {
  return db
    .db()
    .collection("shopItems")
    .aggregate<ShopItem>([
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
): Promise<ShopItem[]> {
  return db
    .db()
    .collection<ShopItem>("shopItems")
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