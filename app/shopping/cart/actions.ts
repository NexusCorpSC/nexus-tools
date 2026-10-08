"use server";

import { ObjectId } from "bson";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  addToCart,
  getCartGroups,
  getCartLines,
  removeFromCart,
  setCartQuantity,
} from "@/lib/cart";
import { isUserSellerOfShop, type ShopItemDbModel } from "@/lib/shop-items";
import { placeDirectOrder, type OrderPickup } from "@/lib/shop-orders";

const MAX_MESSAGE = 2000;
const MAX_PICKUP_NOTE = 200;

export type CartError =
  | "LISTING_NOT_FOUND"
  | "NOT_FOR_SALE"
  | "OWN_SHOP"
  | "INVALID_QUANTITY"
  | "NOT_ENOUGH_STOCK"
  | "CART_FULL";

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("NOT_AUTHENTICATED");
  return session;
}

function revalidateCart() {
  // L'en-tête porte le nombre d'articles : toutes les pages le relisent.
  revalidatePath("/", "layout");
}

/** Ajoute une quantité d'une annonce au panier, sans dépasser le stock. */
export async function addToCartAction(
  listingId: string,
  quantity: number,
): Promise<{ error?: CartError; count?: number }> {
  const session = await requireSession();
  const userId = new ObjectId(session.user.id);

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "INVALID_QUANTITY" };
  }
  const listing = await db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .findOne({ id: listingId });
  if (!listing) return { error: "LISTING_NOT_FOUND" };
  if (listing.type !== "OBJECT") return { error: "NOT_FOR_SALE" };
  if (await isUserSellerOfShop(listing.shopId, userId)) {
    return { error: "OWN_SHOP" };
  }

  const lines = await getCartLines(userId);
  const inCart =
    lines.find((line) => line.listingId === listingId)?.quantity ?? 0;
  const available = listing.stock - (listing.reserved ?? 0);
  if (inCart + quantity > available) return { error: "NOT_ENOUGH_STOCK" };

  if (!(await addToCart(userId, listingId, quantity))) {
    return { error: "CART_FULL" };
  }

  revalidateCart();
  const count = lines.reduce((sum, line) => sum + line.quantity, 0) + quantity;
  return { count };
}

/** Change la quantité d'une ligne ; le panier signale un stock dépassé. */
export async function updateCartQuantityAction(
  listingId: string,
  quantity: number,
): Promise<{ error?: CartError }> {
  const session = await requireSession();
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "INVALID_QUANTITY" };
  }
  await setCartQuantity(new ObjectId(session.user.id), listingId, quantity);
  revalidateCart();
  return {};
}

export async function removeFromCartAction(listingId: string): Promise<void> {
  const session = await requireSession();
  await removeFromCart(new ObjectId(session.user.id), [listingId]);
  revalidateCart();
}

export type CheckoutError = "EMPTY_CART" | "CART_CHANGED" | "PICKUP_REQUIRED";

/**
 * Valide le panier : une commande par magasin, toutes ou aucune. Une ligne
 * qui ne peut plus se commander bloque la validation, et le panier la
 * signale. Redirige vers le récapitulatif des commandes créées.
 */
export async function checkoutCartAction(input: {
  shops: { shopId: string; proposedPickup?: string; note?: string }[];
}): Promise<{ error?: CheckoutError; shopId?: string }> {
  const session = await requireSession();
  const userId = new ObjectId(session.user.id);
  const userName = session.user.name || session.user.email || "?";

  const groups = await getCartGroups(userId);
  if (groups.length === 0) return { error: "EMPTY_CART" };

  // Le panier affiché doit être celui qui se valide : mêmes magasins, et
  // aucune ligne en défaut depuis.
  const choices = new Map(input.shops.map((shop) => [shop.shopId, shop]));
  if (
    groups.some(
      (group) =>
        !choices.has(group.shopId) || group.lines.some((line) => line.problem),
    )
  ) {
    return { error: "CART_CHANGED" };
  }

  const pickups = new Map<string, OrderPickup>();
  for (const group of groups) {
    const proposed = choices
      .get(group.shopId)
      ?.proposedPickup?.trim()
      .slice(0, MAX_PICKUP_NOTE);
    if (proposed) {
      pickups.set(group.shopId, { name: proposed, proposed: true });
    } else if (group.location) {
      pickups.set(group.shopId, {
        name: group.location.name,
        locationId: group.location.id,
        ...(group.location.system && { system: group.location.system }),
      });
    } else {
      return { error: "PICKUP_REQUIRED", shopId: group.shopId };
    }
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
        choices.get(group.shopId)?.note?.trim().slice(0, MAX_MESSAGE) ||
        undefined,
      userId,
      userName,
      checkoutId,
    });
    revalidatePath(`/shops/${group.shopId}/bo/orders`);
  }

  await removeFromCart(
    userId,
    groups.flatMap((group) => group.lines.map((line) => line.listingId)),
  );
  revalidateCart();
  redirect(`/shopping/cart/${checkoutId}`);
}
