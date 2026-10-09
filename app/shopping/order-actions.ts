"use server";

import { ObjectId } from "bson";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MAX_ORDER_MESSAGE, orderListingNow } from "@/lib/marketplace-purchase";
import { isUserSellerOfShop } from "@/lib/shop-items";
import {
  addOrderMessage,
  type DirectOrderError,
  getOrderById,
  type OrderAction,
  type OrderRole,
  type ShopOrder,
  transitionOrder,
  type TransitionError,
} from "@/lib/shop-orders";

const MAX_MESSAGE = MAX_ORDER_MESSAGE;

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
  const result = await orderListingNow(
    { id: new ObjectId(session.user.id), name: displayName(session.user) },
    input,
  );
  if (result.error || !result.orderId) return { error: result.error };

  revalidatePath("/shopping/my-orders");
  revalidatePath(`/shops/${result.shopId}/bo/orders`);
  redirect(`/shopping/my-orders/${result.orderId}`);
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
