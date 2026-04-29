import "server-only";

import { ObjectId } from "bson";
import { randomUUID } from "node:crypto";
import db from "@/lib/db";

export type OrderStatus =
  | "PENDING"
  | "QUOTED"
  | "ACCEPTED"
  | "REFUSED"
  | "CANCELLED";

export type ShopOrderDbModel = {
  _id: ObjectId;
  id: string;
  shopId: string;
  userId: ObjectId;
  userName: string;
  message: string;
  status: OrderStatus;
  response?: string;
  quote?: number;
  createdAt: string;
  updatedAt: string;
};

export type ShopOrder = {
  id: string;
  shopId: string;
  userId: string;
  userName: string;
  message: string;
  status: OrderStatus;
  response?: string;
  quote?: number;
  createdAt: string;
  updatedAt: string;
};

function toShopOrder(doc: ShopOrderDbModel): ShopOrder {
  return {
    id: doc.id,
    shopId: doc.shopId,
    userId: doc.userId.toString(),
    userName: doc.userName,
    message: doc.message,
    status: doc.status,
    response: doc.response,
    quote: doc.quote,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function placeOrder(
  shopId: string,
  userId: ObjectId,
  userName: string,
  message: string,
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.db().collection<ShopOrderDbModel>("shopOrders").insertOne({
    _id: new ObjectId(),
    id,
    shopId,
    userId,
    userName,
    message,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export async function getOrdersForShop(
  shopId: string,
  { offset, limit }: { offset: number; limit: number },
): Promise<ShopOrder[]> {
  const docs = await db
    .db()
    .collection<ShopOrderDbModel>("shopOrders")
    .find({ shopId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return docs.map(toShopOrder);
}

export async function countOrdersForShop(shopId: string): Promise<number> {
  return db
    .db()
    .collection<ShopOrderDbModel>("shopOrders")
    .countDocuments({ shopId });
}

export async function getOrderById(orderId: string): Promise<ShopOrder | null> {
  const doc = await db
    .db()
    .collection<ShopOrderDbModel>("shopOrders")
    .findOne({ id: orderId });

  return doc ? toShopOrder(doc) : null;
}

export async function respondToOrder(
  orderId: string,
  { message, quote }: { message: string; quote?: number },
): Promise<void> {
  const update: Record<string, unknown> = {
    status: "QUOTED",
    response: message,
    updatedAt: new Date().toISOString(),
  };
  if (quote !== undefined) {
    update.quote = quote;
  }

  await db
    .db()
    .collection<ShopOrderDbModel>("shopOrders")
    .updateOne({ id: orderId }, { $set: update });
}

export async function cancelOrder(
  orderId: string,
  userId: ObjectId,
): Promise<boolean> {
  const result = await db
    .db()
    .collection<ShopOrderDbModel>("shopOrders")
    .updateOne(
      {
        id: orderId,
        userId,
        status: { $in: ["PENDING", "QUOTED"] },
      },
      {
        $set: {
          status: "CANCELLED",
          updatedAt: new Date().toISOString(),
        },
      },
    );

  return result.modifiedCount > 0;
}

export async function acceptQuote(
  orderId: string,
  userId: ObjectId,
): Promise<boolean> {
  const result = await db
    .db()
    .collection<ShopOrderDbModel>("shopOrders")
    .updateOne(
      { id: orderId, userId, status: "QUOTED" },
      {
        $set: {
          status: "ACCEPTED",
          updatedAt: new Date().toISOString(),
        },
      },
    );

  return result.modifiedCount > 0;
}

export async function refuseQuote(
  orderId: string,
  userId: ObjectId,
): Promise<boolean> {
  const result = await db
    .db()
    .collection<ShopOrderDbModel>("shopOrders")
    .updateOne(
      { id: orderId, userId, status: "QUOTED" },
      {
        $set: {
          status: "REFUSED",
          updatedAt: new Date().toISOString(),
        },
      },
    );

  return result.modifiedCount > 0;
}

export async function getOrdersForUser(
  userId: ObjectId,
  { offset, limit }: { offset: number; limit: number },
): Promise<ShopOrder[]> {
  const docs = await db
    .db()
    .collection<ShopOrderDbModel>("shopOrders")
    .find({ userId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return docs.map(toShopOrder);
}

export async function countOrdersForUser(userId: ObjectId): Promise<number> {
  return db
    .db()
    .collection<ShopOrderDbModel>("shopOrders")
    .countDocuments({ userId });
}

