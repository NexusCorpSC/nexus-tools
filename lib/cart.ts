import "server-only";

import { ObjectId } from "bson";
import db from "@/lib/db";
import {
  isListingOnSale,
  type ListingLocation,
  type ShopDbModel,
  type ShopItemDbModel,
} from "@/lib/shop-items";
import { syncLinkedListings } from "@/lib/shop-stock";

/**
 * Le panier d'un joueur : des annonces de plusieurs magasins, gardées sur le
 * serveur pour suivre d'un appareil à l'autre. Il ne réserve rien : le prix
 * et le stock sont relus à l'affichage et à la validation, qui crée une
 * commande par magasin.
 */
export type CartLineDbModel = {
  listingId: string;
  quantity: number;
  addedAt: string;
};

export type CartDbModel = {
  _id: ObjectId;
  userId: ObjectId;
  lines: CartLineDbModel[];
  updatedAt: string;
};

/** Ce qui empêche une ligne d'être commandée en l'état. */
export type CartLineProblem = "NOT_FOR_SALE" | "OWN_SHOP" | "NOT_ENOUGH_STOCK";

export type CartLine = {
  listingId: string;
  name: string;
  image: string;
  unitPrice: number;
  quantity: number;
  available: number;
  location?: ListingLocation;
  problem?: CartLineProblem;
};

export type CartGroup = {
  shopId: string;
  shopName: string;
  /** Le lieu de remise commun à toutes les lignes du magasin, s'il y en a un. */
  location?: ListingLocation;
  lines: CartLine[];
  subtotal: number;
};

/** Au-delà, le panier refuse d'autres annonces. */
export const MAX_CART_LINES = 50;

const DUPLICATE_KEY = 11000;

function carts() {
  return db.db().collection<CartDbModel>("carts");
}

function listings() {
  return db.db().collection<ShopItemDbModel>("shopItems");
}

export async function getCartLines(
  userId: ObjectId,
): Promise<CartLineDbModel[]> {
  const cart = await carts().findOne({ userId }, { projection: { lines: 1 } });
  return cart?.lines ?? [];
}

/** Le nombre d'articles du panier, pour le badge de l'en-tête. */
export async function countCartItems(userId: ObjectId): Promise<number> {
  const lines = await getCartLines(userId);
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Ajoute une quantité d'une annonce : la ligne existante grossit, sinon une
 * ligne s'ajoute. Renvoie faux si le panier est plein.
 */
export async function addToCart(
  userId: ObjectId,
  listingId: string,
  quantity: number,
): Promise<boolean> {
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 2; attempt++) {
    const grown = await carts().updateOne(
      { userId, "lines.listingId": listingId },
      { $inc: { "lines.$.quantity": quantity }, $set: { updatedAt: now } },
    );
    if (grown.matchedCount > 0) return true;

    try {
      const added = await carts().updateOne(
        {
          userId,
          "lines.listingId": { $ne: listingId },
          [`lines.${MAX_CART_LINES - 1}`]: { $exists: false },
        },
        {
          $push: { lines: { listingId, quantity, addedAt: now } },
          $set: { updatedAt: now },
        },
        { upsert: true },
      );
      return added.matchedCount > 0 || added.upsertedCount > 0;
    } catch (error) {
      // Le panier existe déjà (plein, ou la ligne vient d'arriver par une
      // autre requête) : l'upsert bute sur l'index unique.
      if ((error as { code?: number }).code !== DUPLICATE_KEY) throw error;
      const existing = await carts().findOne({ userId });
      if ((existing?.lines.length ?? 0) >= MAX_CART_LINES) return false;
    }
  }
  return false;
}

export async function setCartQuantity(
  userId: ObjectId,
  listingId: string,
  quantity: number,
): Promise<void> {
  await carts().updateOne(
    { userId, "lines.listingId": listingId },
    {
      $set: {
        "lines.$.quantity": quantity,
        updatedAt: new Date().toISOString(),
      },
    },
  );
}

export async function removeFromCart(
  userId: ObjectId,
  listingIds: string[],
): Promise<void> {
  if (listingIds.length === 0) return;
  await carts().updateOne(
    { userId },
    {
      $pull: { lines: { listingId: { $in: listingIds } } },
      $set: { updatedAt: new Date().toISOString() },
    },
  );
}

/**
 * Le panier tel qu'il se commanderait maintenant, groupé par magasin dans
 * l'ordre des ajouts. Les annonces supprimées depuis sont retirées.
 */
export async function getCartGroups(userId: ObjectId): Promise<CartGroup[]> {
  const lines = await getCartLines(userId);
  if (lines.length === 0) return [];

  const ids = lines.map((line) => line.listingId);
  await syncLinkedListings({ id: { $in: ids } });
  const docs = await listings()
    .find({ id: { $in: ids } })
    .toArray();
  const byId = new Map(docs.map((doc) => [doc.id, doc]));

  const gone = lines
    .filter((line) => !byId.has(line.listingId))
    .map((line) => line.listingId);
  if (gone.length > 0) await removeFromCart(userId, gone);

  const shopIds = [...new Set(docs.map((doc) => doc.shopId))];
  const shops = await db
    .db()
    .collection<ShopDbModel>("shops")
    .find(
      { id: { $in: shopIds } },
      { projection: { id: 1, name: 1, sellers: 1, reportHidden: 1 } },
    )
    .toArray();
  const shopById = new Map(shops.map((shop) => [shop.id, shop]));

  const groups = new Map<string, CartGroup>();
  for (const line of lines) {
    const doc = byId.get(line.listingId);
    if (!doc) continue;
    const shop = shopById.get(doc.shopId);
    const available = Math.max(0, doc.stock - (doc.reserved ?? 0));
    const own = !!shop?.sellers?.some((seller) => seller.equals(userId));

    const cartLine: CartLine = {
      listingId: doc.id,
      name: doc.name,
      image: doc.image,
      unitPrice: Number(doc.price) || 0,
      quantity: line.quantity,
      available,
      location: doc.location,
    };
    if (doc.type !== "OBJECT" || !isListingOnSale(doc, shop)) {
      cartLine.problem = "NOT_FOR_SALE";
    } else if (own) cartLine.problem = "OWN_SHOP";
    else if (line.quantity > available) cartLine.problem = "NOT_ENOUGH_STOCK";

    let group = groups.get(doc.shopId);
    if (!group) {
      group = {
        shopId: doc.shopId,
        shopName: shop?.name ?? "",
        lines: [],
        subtotal: 0,
      };
      groups.set(doc.shopId, group);
    }
    group.lines.push(cartLine);
    group.subtotal += cartLine.unitPrice * cartLine.quantity;
  }

  for (const group of groups.values()) {
    const first = group.lines[0].location;
    const shared =
      first && group.lines.every((line) => line.location?.id === first.id);
    if (shared) group.location = first;
  }

  return [...groups.values()];
}
