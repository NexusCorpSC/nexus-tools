import "server-only";

import { ObjectId } from "bson";
import db from "@/lib/db";
import type { ShopDbModel } from "@/lib/shop-items";
import {
  OPEN_STATUSES,
  type OrderKind,
  type OrderStatus,
  type ShopOrder,
  type ShopOrderDbModel,
  toShopOrder,
} from "@/lib/shop-orders";

/** Une commande close reste dans l'app quelques jours, le temps d'en reparler. */
const CLOSED_KEPT_DAYS = 14;
const MAX_PLACED = 50;
const MAX_RECEIVED = 100;

/** Une commande telle que l'app la liste. */
export type AppOrder = {
  id: string;
  shopId: string;
  shopName: string;
  buyerName: string;
  kind: OrderKind;
  /** « 3 × M5A Cannon », ou le message d'une demande sur mesure. */
  summary: string;
  status: OrderStatus;
  total?: number;
  pickup?: string;
  createdAt: string;
  updatedAt: string;
  /** La page de la commande sur le site, côté acheteur ou côté magasin. */
  path: string;
};

/**
 * Ce qui mérite une notification : une commande reçue par un de mes magasins,
 * ou une étape franchie par l'autre partie.
 */
export type AppOrderEvent = {
  orderId: string;
  side: "placed" | "received";
  type: "new" | "status" | "quote";
  status: OrderStatus;
  quote?: number;
  shopName: string;
  buyerName: string;
  summary: string;
  pickup?: string;
  at: string;
  path: string;
};

export type AppOrdersSummary = {
  placed: AppOrder[];
  /** Les magasins où je vends, pour ranger les commandes reçues. */
  shops: { id: string; name: string }[];
  received: AppOrder[];
  /** Vide sans `since` : la première lecture ne fait que poser le repère. */
  events: AppOrderEvent[];
  now: string;
};

function orders() {
  return db.db().collection<ShopOrderDbModel>("shopOrders");
}

function toAppOrder(
  order: ShopOrder,
  shopName: string,
  side: AppOrderEvent["side"],
): AppOrder {
  return {
    id: order.id,
    shopId: order.shopId,
    shopName,
    buyerName: order.userName,
    kind: order.kind,
    summary: order.message,
    status: order.status,
    total: order.total,
    pickup: order.pickup?.name,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    path:
      side === "placed"
        ? `/shopping/my-orders/${order.id}`
        : `/shops/${order.shopId}/bo/orders/${order.id}`,
  };
}

/** Les étapes franchies par l'autre partie depuis `since`. */
function eventsOf(
  order: ShopOrder,
  app: AppOrder,
  side: AppOrderEvent["side"],
  since: string,
): AppOrderEvent[] {
  const base = {
    orderId: order.id,
    side,
    shopName: app.shopName,
    buyerName: app.buyerName,
    summary: app.summary,
    pickup: app.pickup,
    path: app.path,
  };
  const events: AppOrderEvent[] = [];
  if (side === "received" && order.createdAt > since) {
    events.push({
      ...base,
      type: "new",
      status: "PENDING",
      at: order.createdAt,
    });
  }
  const other = side === "placed" ? "seller" : "buyer";
  for (const entry of order.timeline) {
    if (entry.at <= since || entry.role !== other) continue;
    if (entry.kind === "quote") {
      events.push({
        ...base,
        type: "quote",
        status: "QUOTED",
        quote: entry.quote,
        at: entry.at,
      });
    } else if (
      entry.kind === "status" &&
      entry.status &&
      entry.status !== "PENDING"
    ) {
      events.push({
        ...base,
        type: "status",
        status: entry.status,
        at: entry.at,
      });
    }
  }
  return events;
}

/**
 * Les commandes d'un joueur pour l'app : celles qu'il a passées, celles que
 * reçoivent ses magasins, et ce qui leur est arrivé depuis `since`.
 */
export async function getAppOrders(
  userId: ObjectId,
  since?: string,
): Promise<AppOrdersSummary> {
  const now = new Date().toISOString();
  const keptSince = new Date(
    Date.now() - CLOSED_KEPT_DAYS * 24 * 3_600_000,
  ).toISOString();
  const shown = {
    $or: [
      { status: { $in: OPEN_STATUSES } },
      { updatedAt: { $gte: keptSince } },
    ],
  };

  const shops = await db
    .db()
    .collection<ShopDbModel>("shops")
    .find({ sellers: userId }, { projection: { _id: 0, id: 1, name: 1 } })
    .sort({ name: 1 })
    .toArray();
  const shopIds = shops.map((shop) => shop.id);

  const [placedDocs, receivedDocs] = await Promise.all([
    orders()
      .find({ userId, ...shown })
      .sort({ updatedAt: -1 })
      .limit(MAX_PLACED)
      .toArray(),
    shopIds.length === 0
      ? []
      : orders()
          .find({ shopId: { $in: shopIds }, ...shown })
          .sort({ updatedAt: -1 })
          .limit(MAX_RECEIVED)
          .toArray(),
  ]);

  // Les magasins des commandes passées, que je n'y vende pas forcément.
  const names = new Map(shops.map((shop) => [shop.id, shop.name]));
  const missing = [
    ...new Set(
      placedDocs.map((doc) => doc.shopId).filter((id) => !names.has(id)),
    ),
  ];
  if (missing.length > 0) {
    const others = await db
      .db()
      .collection<ShopDbModel>("shops")
      .find(
        { id: { $in: missing } },
        { projection: { _id: 0, id: 1, name: 1 } },
      )
      .toArray();
    for (const shop of others) names.set(shop.id, shop.name);
  }

  const events: AppOrderEvent[] = [];
  const read = (docs: ShopOrderDbModel[], side: AppOrderEvent["side"]) =>
    docs.map((doc) => {
      const order = toShopOrder(doc);
      const app = toAppOrder(order, names.get(order.shopId) ?? "", side);
      if (since && order.updatedAt > since) {
        events.push(...eventsOf(order, app, side, since));
      }
      return app;
    });

  const placed = read(placedDocs, "placed");
  const received = read(receivedDocs, "received");
  events.sort((a, b) => a.at.localeCompare(b.at));

  return {
    placed,
    shops: shops.map((shop) => ({ id: shop.id, name: shop.name })),
    received,
    events,
    now,
  };
}
