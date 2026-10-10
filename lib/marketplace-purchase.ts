import "server-only";

import { ObjectId } from "bson";
import { randomUUID } from "node:crypto";
import db from "@/lib/db";
import {
  addToCart,
  getCartGroups,
  getCartLines,
  removeFromCart,
  type CartGroup,
} from "@/lib/cart";
import {
  getShop,
  isListingOnSale,
  isUserSellerOfShop,
  type ShopItemDbModel,
} from "@/lib/shop-items";
import { syncLinkedListings } from "@/lib/shop-stock";
import {
  type DirectOrderError,
  type OrderPickup,
  placeDirectOrder,
} from "@/lib/shop-orders";

/**
 * Les achats sur la marketplace, communs au site (actions du panier et de la
 * fiche d'annonce) et au serveur MCP : les mêmes contrôles, puis les mêmes
 * commandes.
 */

export const MAX_ORDER_MESSAGE = 2000;
const MAX_PICKUP_NOTE = 200;

export type CartError =
  | "LISTING_NOT_FOUND"
  | "NOT_FOR_SALE"
  | "OWN_SHOP"
  | "INVALID_QUANTITY"
  | "NOT_ENOUGH_STOCK"
  | "CART_FULL";

export type CheckoutError = "EMPTY_CART" | "CART_CHANGED" | "PICKUP_REQUIRED";

export type Buyer = { id: ObjectId; name: string };

/**
 * L'annonce qu'un joueur peut acheter en cette quantité, en plus de ce qu'il
 * a déjà mis de côté (`alreadyHeld`, son panier), ou l'erreur.
 */
async function purchasableListing(
  userId: ObjectId,
  listingId: string,
  quantity: number,
  alreadyHeld = 0,
): Promise<{ listing?: ShopItemDbModel; error?: DirectOrderError }> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "INVALID_QUANTITY" };
  }
  await syncLinkedListings({ id: listingId });
  const listing = await db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .findOne({ id: listingId });
  if (!listing) return { error: "LISTING_NOT_FOUND" };
  if (
    listing.type !== "OBJECT" ||
    !isListingOnSale(listing, await getShop(listing.shopId))
  ) {
    return { error: "NOT_FOR_SALE" };
  }
  if (await isUserSellerOfShop(listing.shopId, userId)) {
    return { error: "OWN_SHOP" };
  }
  const available = listing.stock - (listing.reserved ?? 0);
  if (alreadyHeld + quantity > available) return { error: "NOT_ENOUGH_STOCK" };
  return { listing };
}

/** Le lieu proposé par l'acheteur, sinon celui du vendeur, ou rien. */
function pickupFor(
  location: ShopItemDbModel["location"],
  proposedPickup?: string,
): OrderPickup | null {
  const proposed = proposedPickup?.trim().slice(0, MAX_PICKUP_NOTE);
  if (proposed) return { name: proposed, proposed: true };
  if (location) {
    return {
      name: location.name,
      locationId: location.id,
      ...(location.system && { system: location.system }),
    };
  }
  return null;
}

/** Ajoute une quantité d'une annonce au panier, sans dépasser le stock. */
export async function addListingToCart(
  userId: ObjectId,
  listingId: string,
  quantity: number,
): Promise<{ error?: CartError; count?: number }> {
  const lines = await getCartLines(userId);
  const inCart =
    lines.find((line) => line.listingId === listingId)?.quantity ?? 0;
  const { error } = await purchasableListing(
    userId,
    listingId,
    quantity,
    inCart,
  );
  if (error) return { error };
  if (!(await addToCart(userId, listingId, quantity))) {
    return { error: "CART_FULL" };
  }
  const count = lines.reduce((sum, line) => sum + line.quantity, 0) + quantity;
  return { count };
}

/** Achat direct d'une annonce : une commande en attente du magasin. */
export async function orderListingNow(
  buyer: Buyer,
  input: {
    listingId: string;
    quantity: number;
    /** Absent : le lieu de l'annonce. Présent : le lieu proposé par l'acheteur. */
    proposedPickup?: string;
    note?: string;
  },
): Promise<{
  orderId?: string;
  shopId?: string;
  error?: DirectOrderError | "PICKUP_REQUIRED";
}> {
  const { listing, error } = await purchasableListing(
    buyer.id,
    input.listingId,
    input.quantity,
  );
  if (error || !listing) return { error: error ?? "LISTING_NOT_FOUND" };
  const pickup = pickupFor(listing.location, input.proposedPickup);
  if (!pickup) return { error: "PICKUP_REQUIRED" };

  const orderId = await placeDirectOrder({
    shopId: listing.shopId,
    lines: [
      {
        listingId: listing.id,
        name: listing.name,
        quantity: input.quantity,
        unitPrice: Number(listing.price) || 0,
      },
    ],
    pickup,
    note: input.note?.trim().slice(0, MAX_ORDER_MESSAGE) || undefined,
    userId: buyer.id,
    userName: buyer.name,
  });
  return { orderId, shopId: listing.shopId };
}

export type CheckoutChoice = {
  shopId: string;
  proposedPickup?: string;
  note?: string;
};

/**
 * Valide le panier : une commande par magasin, toutes ou aucune. `groups`
 * est le panier que le joueur a vu ; s'il a changé depuis (autre magasin,
 * ligne en défaut), rien n'est commandé.
 */
export async function checkoutCart(
  buyer: Buyer,
  choices: CheckoutChoice[],
): Promise<{
  checkoutId?: string;
  groups?: CartGroup[];
  error?: CheckoutError;
  shopId?: string;
}> {
  const groups = await getCartGroups(buyer.id);
  if (groups.length === 0) return { error: "EMPTY_CART" };

  const byShop = new Map(choices.map((choice) => [choice.shopId, choice]));
  if (
    groups.some(
      (group) =>
        !byShop.has(group.shopId) || group.lines.some((line) => line.problem),
    )
  ) {
    return { error: "CART_CHANGED" };
  }

  const pickups = new Map<string, OrderPickup>();
  for (const group of groups) {
    const pickup = pickupFor(
      group.location,
      byShop.get(group.shopId)?.proposedPickup,
    );
    if (!pickup) return { error: "PICKUP_REQUIRED", shopId: group.shopId };
    pickups.set(group.shopId, pickup);
  }

  const checkoutId = randomUUID();
  for (const group of groups) {
    await placeDirectOrder({
      shopId: group.shopId,
      lines: group.lines.map((line) => ({
        listingId: line.listingId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      pickup: pickups.get(group.shopId)!,
      note:
        byShop.get(group.shopId)?.note?.trim().slice(0, MAX_ORDER_MESSAGE) ||
        undefined,
      userId: buyer.id,
      userName: buyer.name,
      checkoutId,
    });
  }

  await removeFromCart(
    buyer.id,
    groups.flatMap((group) => group.lines.map((line) => line.listingId)),
  );
  return { checkoutId, groups };
}
