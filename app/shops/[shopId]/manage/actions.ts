"use server";

import db from "@/lib/db";
import { ShopDbModel } from "@/lib/shop-items";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { revalidatePath } from "next/cache";
import {
  checkLogo,
  checkShopFields,
  cleanShopName,
  searchUsersByName,
  uploadShopLogo,
  type UserMatch,
} from "@/lib/shops";

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

    revalidatePath(`/shops/${shopId}/bo/sellers`);
    return { success: true };
  } catch (e) {
    console.error(e);
    return { success: false, message: "error" };
  }
}

/** Le nom, la description et le logo du magasin. */
export async function updateShopInfo(
  shopId: string,
  formData: FormData,
): Promise<{ success: boolean; message?: string }> {
  try {
    await assertIsSeller(shopId);

    const name = cleanShopName(String(formData.get("name") ?? ""));
    const description = String(formData.get("description") ?? "").trim();
    const invalid = await checkShopFields(name, description, shopId);
    if (invalid) return { success: false, message: invalid };

    const logo = checkLogo(formData.get("logo"));
    if (logo === "invalid") return { success: false, message: "LOGO_INVALID" };

    const set: Partial<ShopDbModel> = { name, description };
    if (logo) set.logo = await uploadShopLogo(shopId, logo);
    const removeLogo = formData.get("removeLogo") === "1" && !logo;

    await db
      .db()
      .collection<ShopDbModel>("shops")
      .updateOne(
        { id: shopId },
        { $set: set, ...(removeLogo && { $unset: { logo: "" } }) },
      );

    revalidatePath(`/shops/${shopId}`, "layout");
    revalidatePath("/shopping");
    return { success: true };
  } catch (e) {
    console.error(e);
    return { success: false, message: "error" };
  }
}

/** Les joueurs à qui ouvrir le magasin, cherchés par leur pseudo. */
export async function searchSellerCandidates(
  shopId: string,
  query: string,
): Promise<UserMatch[]> {
  await assertIsSeller(shopId);
  const shop = await db
    .db()
    .collection<ShopDbModel>("shops")
    .findOne({ id: shopId }, { projection: { sellers: 1 } });
  return searchUsersByName(query.slice(0, 60), shop?.sellers ?? []);
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
    if (!ObjectId.isValid(sellerId)) {
      return { success: false, message: "invalidUserId" };
    }

    const sellerObjectId = new ObjectId(sellerId);
    // Le propriétaire reste vendeur de son magasin.
    const owned = await db
      .db()
      .collection<ShopDbModel>("shops")
      .countDocuments({ id: shopId, ownerId: sellerObjectId });
    if (owned > 0) return { success: false, message: "cannotRemoveOwner" };

    await db
      .db()
      .collection<ShopDbModel>("shops")
      .updateOne({ id: shopId }, { $pull: { sellers: sellerObjectId } });

    revalidatePath(`/shops/${shopId}/bo/sellers`);
    return { success: true };
  } catch (e) {
    console.error(e);
    return { success: false, message: "error" };
  }
}

