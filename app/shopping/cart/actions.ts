"use server";

import { ObjectId } from "bson";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { removeFromCart, setCartQuantity } from "@/lib/cart";
import {
  addListingToCart,
  type CartError,
  checkoutCart,
  type CheckoutError,
} from "@/lib/marketplace-purchase";

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
  const result = await addListingToCart(
    new ObjectId(session.user.id),
    listingId,
    quantity,
  );
  if (!result.error) revalidateCart();
  return result;
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

/**
 * Valide le panier : une commande par magasin, toutes ou aucune. Une ligne
 * qui ne peut plus se commander bloque la validation, et le panier la
 * signale. Redirige vers le récapitulatif des commandes créées.
 */
export async function checkoutCartAction(input: {
  shops: { shopId: string; proposedPickup?: string; note?: string }[];
}): Promise<{ error?: CheckoutError; shopId?: string }> {
  const session = await requireSession();
  const result = await checkoutCart(
    {
      id: new ObjectId(session.user.id),
      name: session.user.name || session.user.email || "?",
    },
    input.shops,
  );
  if (result.error || !result.checkoutId) {
    return { error: result.error, shopId: result.shopId };
  }
  for (const group of result.groups ?? []) {
    revalidatePath(`/shops/${group.shopId}/bo/orders`);
  }
  revalidateCart();
  redirect(`/shopping/cart/${result.checkoutId}`);
}
