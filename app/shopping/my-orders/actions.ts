"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  placeOrder,
  cancelOrder,
  acceptQuote,
  refuseQuote,
} from "@/lib/shop-orders";
import { ObjectId } from "bson";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function getAuthSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    throw new Error("NOT_AUTHENTICATED");
  }
  return session;
}

export async function placeOrderAction(
  shopId: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await getAuthSession();

  const message = (formData.get("message") as string | null)?.trim() ?? "";
  if (!message) {
    return { error: "MESSAGE_REQUIRED" };
  }

  const orderId = await placeOrder(
    shopId,
    new ObjectId(session.user.id),
    session.user.name ?? session.user.email ?? "Unknown",
    message,
  );

  revalidatePath(`/shops/${shopId}`);
  redirect(`/shopping/my-orders/${orderId}`);
}

export async function cancelOrderAction(
  orderId: string,
  comment?: string,
): Promise<{ error?: string }> {
  const session = await getAuthSession();
  const success = await cancelOrder(orderId, new ObjectId(session.user.id), comment);
  if (!success) {
    return { error: "CANNOT_CANCEL" };
  }
  revalidatePath(`/shopping/my-order/${orderId}`);
  revalidatePath(`/shopping/my-orders`);
  return {};
}

export async function acceptQuoteAction(
  orderId: string,
  comment?: string,
): Promise<{ error?: string }> {
  const session = await getAuthSession();
  const success = await acceptQuote(orderId, new ObjectId(session.user.id), comment);
  if (!success) {
    return { error: "CANNOT_ACCEPT" };
  }
  revalidatePath(`/shopping/my-order/${orderId}`);
  return {};
}

export async function refuseQuoteAction(
  orderId: string,
  comment?: string,
): Promise<{ error?: string }> {
  const session = await getAuthSession();
  const success = await refuseQuote(orderId, new ObjectId(session.user.id), comment);
  if (!success) {
    return { error: "CANNOT_REFUSE" };
  }
  revalidatePath(`/shopping/my-order/${orderId}`);
  revalidatePath(`/shopping/my-orders`);
  return {};
}
