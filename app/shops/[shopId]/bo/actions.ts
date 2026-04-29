"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isUserSellerOfShop } from "@/lib/shop-items";
import { respondToOrder } from "@/lib/shop-orders";
import { ObjectId } from "bson";
import { revalidatePath } from "next/cache";

async function assertIsSeller(shopId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("NOT_AUTHENTICATED");
  }
  const isSeller = await isUserSellerOfShop(
    shopId,
    new ObjectId(session.user.id),
  );
  if (!isSeller) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function respondToOrderAction(
  orderId: string,
  shopId: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  await assertIsSeller(shopId);

  const message = (formData.get("message") as string | null)?.trim() ?? "";
  if (!message) {
    return { error: "MESSAGE_REQUIRED" };
  }

  const rawQuote = formData.get("quote") as string | null;
  let quote: number | undefined;
  if (rawQuote && rawQuote.trim() !== "") {
    quote = parseInt(rawQuote, 10);
    if (isNaN(quote) || quote < 0) {
      return { error: "INVALID_QUOTE" };
    }
  }

  await respondToOrder(orderId, { message, quote });

  revalidatePath(`/shops/${shopId}/bo/orders/${orderId}`);
  revalidatePath(`/shops/${shopId}/bo/orders`);
  return {};
}

