"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { placeOrder } from "@/lib/shop-orders";
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

  revalidatePath(`/shops/${shopId}/bo/orders`);
  revalidatePath("/shopping/my-orders");
  redirect(`/shopping/my-orders/${orderId}`);
}
