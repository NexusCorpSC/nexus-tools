"use server";

import db from "@/lib/db";
import { ShopDbModel } from "@/lib/shop-items";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { revalidatePath } from "next/cache";

async function assertIsSeller(shopId: string): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Not authenticated");

  const shop = await db
    .db()
    .collection<ShopDbModel>("shops")
    .findOne({ id: shopId, sellers: new ObjectId(session.user.id) });

  if (!shop) throw new Error("Not authorized");
}

export async function addSeller(
  shopId: string,
  userId: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    await assertIsSeller(shopId);

    let userObjectId: ObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch {
      return { success: false, message: "invalidUserId" };
    }

    const user = await db
      .db()
      .collection("users")
      .findOne({ _id: userObjectId });

    if (!user) {
      return { success: false, message: "userNotFound" };
    }

    // Check if already a seller
    const shop = await db
      .db()
      .collection<ShopDbModel>("shops")
      .findOne({ id: shopId });

    if (!shop) return { success: false, message: "shopNotFound" };

    if (shop.sellers?.some((s) => s.equals(userObjectId))) {
      return { success: false, message: "alreadySeller" };
    }

    await db
      .db()
      .collection<ShopDbModel>("shops")
      .updateOne({ id: shopId }, { $push: { sellers: userObjectId } });

    revalidatePath(`/shops/${shopId}/manage`);
    return { success: true };
  } catch (e) {
    console.error(e);
    return { success: false, message: "error" };
  }
}

export async function removeSeller(
  shopId: string,
  sellerId: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { success: false, message: "notAuthenticated" };

    await assertIsSeller(shopId);

    // Cannot remove yourself
    if (sellerId === session.user.id) {
      return { success: false, message: "cannotRemoveSelf" };
    }

    const sellerObjectId = new ObjectId(sellerId);

    await db
      .db()
      .collection<ShopDbModel>("shops")
      .updateOne({ id: shopId }, { $pull: { sellers: sellerObjectId } });

    revalidatePath(`/shops/${shopId}/manage`);
    return { success: true };
  } catch (e) {
    console.error(e);
    return { success: false, message: "error" };
  }
}

