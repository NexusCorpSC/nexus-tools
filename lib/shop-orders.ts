import "server-only";

import { ObjectId } from "bson";
import { randomUUID } from "node:crypto";
import db from "@/lib/db";
import type { ShopItemDbModel } from "@/lib/shop-items";
import { consumeStock, syncLinkedListings } from "@/lib/shop-stock";

/**
 * Le cycle d'une commande :
 * Demandée (PENDING) → Devis envoyé (QUOTED, sur mesure ou lieu à convenir)
 * → Confirmée (CONFIRMED, la quantité est réservée) → Prête (READY)
 * → Remise (DELIVERED, le stock baisse).
 * L'acheteur peut annuler (CANCELLED) tant que rien n'est prêt ; le vendeur
 * peut refuser (REFUSED) tant que rien n'est remis, et l'acheteur aussi
 * quand il décline un devis.
 *
 * ACCEPTED est l'état « devis accepté » des commandes passées avant ce cycle :
 * il se lit comme une commande confirmée sans réservation.
 */
export type OrderStatus =
  | "PENDING"
  | "QUOTED"
  | "CONFIRMED"
  | "ACCEPTED"
  | "READY"
  | "DELIVERED"
  | "REFUSED"
  | "CANCELLED";

export type OrderKind = "DIRECT" | "CUSTOM";
export type OrderRole = "buyer" | "seller";

export type OrderLine = {
  listingId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type OrderPickup = {
  /** Le lieu de l'annonce, ou celui que l'acheteur propose. */
  name: string;
  system?: string;
  locationId?: string;
  /** Vrai quand l'acheteur a proposé un autre lieu que celui de l'annonce. */
  proposed?: boolean;
};

/** Un message, un devis ou un changement d'état, dans l'ordre du fil. */
export type OrderEntry = {
  id: string;
  at: string;
  role: OrderRole;
  authorName: string;
  kind: "message" | "quote" | "status";
  body?: string;
  quote?: number;
  status?: OrderStatus;
};

export type ShopOrderDbModel = {
  _id: ObjectId;
  id: string;
  shopId: string;
  userId: ObjectId;
  userName: string;
  /** Absent sur les anciennes commandes, toutes sur mesure. */
  kind?: OrderKind;
  /** Premier message, ou résumé de l'achat direct, pour les listes. */
  message: string;
  status: OrderStatus;
  lines?: OrderLine[];
  pickup?: OrderPickup;
  /** Le montant convenu : prix des lignes, puis dernier devis. */
  total?: number;
  /** Vrai tant que la quantité des lignes est réservée sur le stock. */
  reserved?: boolean;
  timeline?: OrderEntry[];
  /** Le panier validé qui a créé la commande, avec une par magasin. */
  checkoutId?: string;
  // Champs des anciennes commandes, lus pour reconstruire leur fil.
  response?: string;
  quote?: number;
  userComment?: string;
  createdAt: string;
  updatedAt: string;
};

export type ShopOrder = {
  id: string;
  shopId: string;
  userId: string;
  userName: string;
  kind: OrderKind;
  message: string;
  status: OrderStatus;
  lines: OrderLine[];
  pickup?: OrderPickup;
  total?: number;
  timeline: OrderEntry[];
  checkoutId?: string;
  createdAt: string;
  updatedAt: string;
};

/** Le fil d'une ancienne commande, reconstruit depuis ses champs. */
function legacyTimeline(doc: ShopOrderDbModel): OrderEntry[] {
  const entries: OrderEntry[] = [
    {
      id: `${doc.id}-message`,
      at: doc.createdAt,
      role: "buyer",
      authorName: doc.userName,
      kind: "message",
      body: doc.message,
    },
  ];
  if (doc.response || doc.quote !== undefined) {
    entries.push({
      id: `${doc.id}-response`,
      at: doc.updatedAt,
      role: "seller",
      authorName: "",
      kind: doc.quote !== undefined ? "quote" : "message",
      body: doc.response,
      quote: doc.quote,
    });
  }
  if (doc.userComment) {
    entries.push({
      id: `${doc.id}-comment`,
      at: doc.updatedAt,
      role: "buyer",
      authorName: doc.userName,
      kind: "message",
      body: doc.userComment,
    });
  }
  return entries;
}

function toShopOrder(doc: ShopOrderDbModel): ShopOrder {
  return {
    id: doc.id,
    shopId: doc.shopId,
    userId: doc.userId.toString(),
    userName: doc.userName,
    kind: doc.kind ?? "CUSTOM",
    message: doc.message,
    status: doc.status,
    lines: doc.lines ?? [],
    pickup: doc.pickup,
    total: doc.total ?? doc.quote,
    timeline: doc.timeline ?? legacyTimeline(doc),
    checkoutId: doc.checkoutId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function orders() {
  return db.db().collection<ShopOrderDbModel>("shopOrders");
}

function listings() {
  return db.db().collection<ShopItemDbModel>("shopItems");
}

function entry(
  role: OrderRole,
  authorName: string,
  fields: Omit<OrderEntry, "id" | "at" | "role" | "authorName">,
): OrderEntry {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    role,
    authorName,
    ...fields,
  };
}

/** Une demande sur mesure : un message libre, le magasin répond par un devis. */
export async function placeOrder(
  shopId: string,
  userId: ObjectId,
  userName: string,
  message: string,
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await orders().insertOne({
    _id: new ObjectId(),
    id,
    shopId,
    userId,
    userName,
    kind: "CUSTOM",
    message,
    status: "PENDING",
    timeline: [entry("buyer", userName, { kind: "message", body: message })],
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export type DirectOrderError =
  | "LISTING_NOT_FOUND"
  | "NOT_FOR_SALE"
  | "OWN_SHOP"
  | "INVALID_QUANTITY"
  | "NOT_ENOUGH_STOCK";

/**
 * Un achat direct : une annonce depuis sa fiche, ou les annonces d'un même
 * magasin depuis le panier. Rien n'est réservé avant que le magasin confirme.
 */
export async function placeDirectOrder({
  shopId,
  lines,
  pickup,
  note,
  userId,
  userName,
  checkoutId,
}: {
  shopId: string;
  lines: OrderLine[];
  pickup: OrderPickup;
  note?: string;
  userId: ObjectId;
  userName: string;
  /** Le panier validé dont la commande fait partie. */
  checkoutId?: string;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const timeline = [
    entry("buyer", userName, {
      kind: "status",
      status: "PENDING",
    }),
  ];
  if (note)
    timeline.push(entry("buyer", userName, { kind: "message", body: note }));

  await orders().insertOne({
    _id: new ObjectId(),
    id,
    shopId,
    userId,
    userName,
    kind: "DIRECT",
    message: lines.map((line) => `${line.quantity} × ${line.name}`).join(", "),
    status: "PENDING",
    lines,
    pickup,
    total: lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    timeline,
    ...(checkoutId && { checkoutId }),
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

/** Les commandes nées d'un même panier validé, dans l'ordre du panier. */
export async function getOrdersOfCheckout(
  userId: ObjectId,
  checkoutId: string,
): Promise<ShopOrder[]> {
  const docs = await orders()
    .find({ userId, checkoutId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return docs.map(toShopOrder);
}

export async function getOrderById(orderId: string): Promise<ShopOrder | null> {
  const doc = await orders().findOne({ id: orderId });
  return doc ? toShopOrder(doc) : null;
}

export async function getOrdersForShop(
  shopId: string,
  { offset, limit }: { offset: number; limit: number },
): Promise<ShopOrder[]> {
  const docs = await orders()
    .find({ shopId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  return docs.map(toShopOrder);
}

export async function countOrdersForShop(shopId: string): Promise<number> {
  return orders().countDocuments({ shopId });
}

export async function getOrdersForUser(
  userId: ObjectId,
  { offset, limit }: { offset: number; limit: number },
): Promise<ShopOrder[]> {
  const docs = await orders()
    .find({ userId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  return docs.map(toShopOrder);
}

/** Les états d'une commande qui n'est pas encore close. */
const OPEN_STATUSES: OrderStatus[] = [
  "PENDING",
  "QUOTED",
  "CONFIRMED",
  "ACCEPTED",
  "READY",
];

/** Les commandes d'un joueur encore en cours, pour le bouton « Mes commandes ». */
export async function countOpenOrdersForUser(
  userId: ObjectId,
): Promise<number> {
  return orders().countDocuments({ userId, status: { $in: OPEN_STATUSES } });
}

/** Les ventes remises par un magasin, affichées sur ses annonces. */
export async function countDeliveredOrdersForShop(
  shopId: string,
): Promise<number> {
  return orders().countDocuments({ shopId, status: "DELIVERED" });
}

/** Les commandes qui attendent le magasin : à confirmer ou à préparer. */
const SELLER_TODO: OrderStatus[] = ["PENDING", "CONFIRMED", "ACCEPTED"];

/** Ce que la navigation du back-office compte. */
export async function getShopOrderCounts(
  shopId: string,
): Promise<{ toHandle: number; custom: number }> {
  const [toHandle, custom] = await Promise.all([
    orders().countDocuments({ shopId, status: { $in: SELLER_TODO } }),
    orders().countDocuments({
      shopId,
      kind: { $ne: "DIRECT" },
      status: { $in: OPEN_STATUSES },
    }),
  ]);
  return { toHandle, custom };
}

/** Les commandes en cours d'un magasin, pour le tableau par étape. */
export async function getOpenOrdersForShop(
  shopId: string,
  { kind }: { kind?: OrderKind } = {},
): Promise<ShopOrder[]> {
  const docs = await orders()
    .find({
      shopId,
      status: { $in: OPEN_STATUSES },
      ...(kind === "DIRECT" && { kind: "DIRECT" }),
      ...(kind === "CUSTOM" && { kind: { $ne: "DIRECT" } }),
    })
    .sort({ updatedAt: 1 })
    .limit(300)
    .toArray();
  return docs.map(toShopOrder);
}

/** Les commandes closes d'un magasin, les plus récentes d'abord. */
export async function getClosedOrdersForShop(
  shopId: string,
  { offset, limit }: { offset: number; limit: number },
): Promise<{ orders: ShopOrder[]; total: number }> {
  const filter = { shopId, status: { $nin: OPEN_STATUSES } };
  const [docs, total] = await Promise.all([
    orders()
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    orders().countDocuments(filter),
  ]);
  return { orders: docs.map(toShopOrder), total };
}

/** Les remises du mois en cours : leur nombre et ce qu'elles ont rapporté. */
export async function getShopMonthStats(
  shopId: string,
): Promise<{ delivered: number; revenue: number }> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [stats] = await orders()
    .aggregate<{ delivered: number; revenue: number }>([
      {
        $match: {
          shopId,
          status: "DELIVERED",
          updatedAt: { $gte: start.toISOString() },
        },
      },
      {
        $group: {
          _id: null,
          delivered: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$total", 0] } },
        },
      },
    ])
    .toArray();
  return stats ?? { delivered: 0, revenue: 0 };
}

/** Une annonce encore engagée dans une commande en cours ne se supprime pas. */
export async function isListingInOpenOrder(listingId: string): Promise<boolean> {
  return (
    (await orders().countDocuments({
      "lines.listingId": listingId,
      status: { $in: OPEN_STATUSES },
    })) > 0
  );
}

export async function countOrdersForUser(userId: ObjectId): Promise<number> {
  return orders().countDocuments({ userId });
}

export async function addOrderMessage(
  orderId: string,
  role: OrderRole,
  authorName: string,
  body: string,
): Promise<void> {
  const doc = await orders().findOne({ id: orderId });
  if (!doc) return;
  const added = entry(role, authorName, { kind: "message", body });
  await orders().updateOne(
    { id: orderId },
    {
      // Une ancienne commande reçoit son fil reconstruit avant le message.
      $push: {
        timeline: {
          $each: doc.timeline ? [added] : [...legacyTimeline(doc), added],
        },
      },
      $set: { updatedAt: new Date().toISOString() },
    },
  );
}

// ─── Stock ───────────────────────────────────────────────────────────────────

/** Réserve les lignes sur le stock disponible, tout ou rien. */
async function reserveLines(lines: OrderLine[]): Promise<boolean> {
  const done: OrderLine[] = [];
  for (const line of lines) {
    const result = await listings().updateOne(
      {
        id: line.listingId,
        $expr: {
          $gte: [
            { $subtract: ["$stock", { $ifNull: ["$reserved", 0] }] },
            line.quantity,
          ],
        },
      },
      { $inc: { reserved: line.quantity } },
    );
    if (result.modifiedCount === 0) {
      await releaseLines(done);
      return false;
    }
    done.push(line);
  }
  return true;
}

async function releaseLines(lines: OrderLine[]): Promise<void> {
  for (const line of lines) {
    await listings().updateOne(
      { id: line.listingId },
      { $inc: { reserved: -line.quantity } },
    );
  }
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export type OrderAction =
  | "confirm"
  | "quote"
  | "accept"
  | "decline"
  | "refuse"
  | "cancel"
  | "ready"
  | "deliver";

/** Qui peut faire quoi, et depuis quels états. */
export const ORDER_ACTIONS: Record<
  OrderAction,
  { role: OrderRole; from: OrderStatus[]; to: OrderStatus }
> = {
  confirm: { role: "seller", from: ["PENDING"], to: "CONFIRMED" },
  quote: { role: "seller", from: ["PENDING", "QUOTED"], to: "QUOTED" },
  accept: { role: "buyer", from: ["QUOTED"], to: "CONFIRMED" },
  decline: { role: "buyer", from: ["QUOTED"], to: "REFUSED" },
  refuse: {
    role: "seller",
    from: ["PENDING", "QUOTED", "CONFIRMED", "ACCEPTED", "READY"],
    to: "REFUSED",
  },
  cancel: {
    role: "buyer",
    from: ["PENDING", "QUOTED", "CONFIRMED", "ACCEPTED"],
    to: "CANCELLED",
  },
  ready: { role: "seller", from: ["CONFIRMED", "ACCEPTED"], to: "READY" },
  deliver: {
    role: "seller",
    from: ["CONFIRMED", "ACCEPTED", "READY"],
    to: "DELIVERED",
  },
};

/** Les actions offertes à un rôle sur une commande dans cet état. */
export function availableActions(
  order: Pick<ShopOrder, "status" | "kind">,
  role: OrderRole,
): OrderAction[] {
  return (Object.keys(ORDER_ACTIONS) as OrderAction[]).filter((action) => {
    const rule = ORDER_ACTIONS[action];
    if (rule.role !== role || !rule.from.includes(order.status)) return false;
    // Une demande sur mesure n'a pas de prix : elle passe par un devis.
    if (action === "confirm" && order.kind !== "DIRECT") return false;
    return true;
  });
}

export type TransitionError =
  | "NOT_ALLOWED"
  | "NOT_ENOUGH_STOCK"
  | "INVALID_QUOTE";

/**
 * Fait passer une commande à l'état suivant. Le filtre sur l'état de départ
 * rend la transition sûre si les deux parties agissent en même temps.
 */
export async function transitionOrder(
  orderId: string,
  action: OrderAction,
  {
    role,
    authorName,
    message,
    quote,
  }: {
    role: OrderRole;
    authorName: string;
    message?: string;
    quote?: number;
  },
): Promise<{ error?: TransitionError }> {
  const rule = ORDER_ACTIONS[action];
  const doc = await orders().findOne({ id: orderId });
  if (!doc) return { error: "NOT_ALLOWED" };
  const order = toShopOrder(doc);
  if (!availableActions(order, role).includes(action)) {
    return { error: "NOT_ALLOWED" };
  }
  if (action === "quote" && (quote === undefined || quote < 0)) {
    return { error: "INVALID_QUOTE" };
  }

  // La confirmation réserve le stock d'un achat direct.
  const reserving = rule.to === "CONFIRMED" && order.lines.length > 0;
  // Un lot d'inventaire a pu bouger depuis : on réserve sur son état du moment.
  if (reserving) {
    await syncLinkedListings({
      id: { $in: order.lines.map((line) => line.listingId) },
    });
  }
  if (reserving && !(await reserveLines(order.lines))) {
    return { error: "NOT_ENOUGH_STOCK" };
  }

  const added: OrderEntry[] = [];
  if (action === "quote") {
    added.push(
      entry(role, authorName, { kind: "quote", quote, body: message }),
    );
  } else {
    added.push(entry(role, authorName, { kind: "status", status: rule.to }));
    if (message)
      added.push(entry(role, authorName, { kind: "message", body: message }));
  }

  const set: Partial<ShopOrderDbModel> = {
    status: rule.to,
    updatedAt: new Date().toISOString(),
  };
  if (action === "quote") set.total = quote;
  if (reserving) set.reserved = true;
  if (
    rule.to === "REFUSED" ||
    rule.to === "CANCELLED" ||
    rule.to === "DELIVERED"
  ) {
    set.reserved = false;
  }

  const update = {
    $set: set,
    // Une ancienne commande reçoit son fil reconstruit avant le nouvel élément.
    $push: {
      timeline: { $each: doc.timeline ? added : [...order.timeline, ...added] },
    },
  };
  const result = await orders().updateOne(
    { id: orderId, status: { $in: rule.from } },
    update,
  );
  if (result.modifiedCount === 0) {
    if (reserving) await releaseLines(order.lines);
    return { error: "NOT_ALLOWED" };
  }

  if (doc.reserved && (rule.to === "REFUSED" || rule.to === "CANCELLED")) {
    await releaseLines(order.lines);
  }
  if (rule.to === "DELIVERED" && doc.reserved) {
    await consumeStock(order.lines, { orderId, byName: authorName });
  }

  return {};
}
