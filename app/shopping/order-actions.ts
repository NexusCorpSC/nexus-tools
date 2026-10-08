"use server";

import { ObjectId } from "bson";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserSellerOfShop, type ShopItemDbModel } from "@/lib/shop-items";
import {
  addOrderMessage,
  type DirectOrderError,
  getOrderById,
  type OrderAction,
  type OrderPickup,
  type OrderRole,
  type ShopOrder,
  placeDirectOrder,
  transitionOrder,
  type TransitionError,
} from "@/lib/shop-orders";

const MAX_MESSAGE = 2000;
const MAX_PICKUP_NOTE = 200;

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("NOT_AUTHENTICATED");
  return session;
}

function displayName(user: { name?: string | null; email?: string | null }) {
  return user.name || user.email || "?";
}

/** Le rôle de l'utilisateur sur la commande, ou rien s'il n'y a pas accès. */
async function roleOn(
  order: ShopOrder,
  userId: string,
  wanted?: OrderRole,
): Promise<OrderRole | null> {
  if (wanted !== "seller" && order.userId === userId) return "buyer";
  if (
    wanted !== "buyer" &&
    (await isUserSellerOfShop(order.shopId, new ObjectId(userId)))
  ) {
    return "seller";
  }
  return null;
}

function revalidateOrder(order: ShopOrder) {
  revalidatePath(`/shopping/my-orders/${order.id}`);
  revalidatePath("/shopping/my-orders");
  revalidatePath(`/shops/${order.shopId}/bo/orders/${order.id}`);
  revalidatePath(`/shops/${order.shopId}/bo/orders`);
}

/**
 * Achat direct depuis la fiche d'une annonce. Redirige vers la commande
 * créée ; renvoie l'erreur sinon.
 */
export async function placeDirectOrderAction(input: {
  listingId: string;
  quantity: number;
  /** Absent : le lieu de l'annonce. Présent : le lieu proposé par l'acheteur. */
  proposedPickup?: string;
  note?: string;
}): Promise<{ error?: DirectOrderError | "PICKUP_REQUIRED" }> {
  const session = await requireSession();

  const listing = await db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .findOne({ id: input.listingId });
  if (!listing) return { error: "LISTING_NOT_FOUND" };
  if (listing.type !== "OBJECT") return { error: "NOT_FOR_SALE" };
  if (await isUserSellerOfShop(listing.shopId, new ObjectId(session.user.id))) {
    return { error: "OWN_SHOP" };
  }

  const quantity = input.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "INVALID_QUANTITY" };
  }
  const available = listing.stock - (listing.reserved ?? 0);
  if (quantity > available) return { error: "NOT_ENOUGH_STOCK" };

  const proposed = input.proposedPickup?.trim().slice(0, MAX_PICKUP_NOTE);
  let pickup: OrderPickup;
  if (proposed) {
    pickup = { name: proposed, proposed: true };
  } else if (listing.location) {
    pickup = {
      name: listing.location.name,
      locationId: listing.location.id,
      ...(listing.location.system && { system: listing.location.system }),
    };
  } else {
    return { error: "PICKUP_REQUIRED" };
  }

  const orderId = await placeDirectOrder({
    shopId: listing.shopId,
    lines: [
      {
        listingId: listing.id,
        name: listing.name,
        quantity,
        unitPrice: Number(listing.price) || 0,
      },
    ],
    pickup,
    note: input.note?.trim().slice(0, MAX_MESSAGE) || undefined,
    userId: new ObjectId(session.user.id),
    userName: displayName(session.user),
  });

  revalidatePath("/shopping/my-orders");
  revalidatePath(`/shops/${listing.shopId}/bo/orders`);
  redirect(`/shopping/my-orders/${orderId}`);
}

/** Un message dans le fil d'une commande, de l'acheteur ou du magasin. */
export async function postOrderMessageAction(
  orderId: string,
  as: OrderRole,
  body: string,
): Promise<{ error?: "NOT_ALLOWED" | "MESSAGE_REQUIRED" }> {
  const session = await requireSession();
  const text = body.trim().slice(0, MAX_MESSAGE);
  if (!text) return { error: "MESSAGE_REQUIRED" };

  const order = await getOrderById(orderId);
  if (!order) return { error: "NOT_ALLOWED" };
  const role = await roleOn(order, session.user.id, as);
  if (!role) return { error: "NOT_ALLOWED" };

  await addOrderMessage(orderId, role, displayName(session.user), text);
  revalidateOrder(order);
  return {};
}

/** Confirmer, chiffrer, accepter, refuser, annuler, préparer ou remettre. */
export async function orderTransitionAction(
  orderId: string,
  action: OrderAction,
  as: OrderRole,
  payload: { message?: string; quote?: number } = {},
): Promise<{ error?: TransitionError }> {
  const session = await requireSession();
  const order = await getOrderById(orderId);
  if (!order) return { error: "NOT_ALLOWED" };
  const role = await roleOn(order, session.user.id, as);
  if (!role) return { error: "NOT_ALLOWED" };

  const result = await transitionOrder(orderId, action, {
    role,
    authorName: displayName(session.user),
    message: payload.message?.trim().slice(0, MAX_MESSAGE) || undefined,
    quote: payload.quote,
  });
  if (!result.error) {
    revalidateOrder(order);
    for (const line of order.lines) {
      revalidatePath(`/shopping/i/${line.listingId}`);
    }
  }
  return result;
}
