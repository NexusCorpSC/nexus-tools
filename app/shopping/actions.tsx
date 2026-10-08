"use server";

import db from "@/lib/db";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import Ajv from "ajv";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import {
  isUserSellerOfShop,
  type ListingLocation,
  ShopItemDbModel,
} from "@/lib/shop-items";
import { getItemBySlug } from "@/lib/items";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const ajv = new Ajv({ coerceTypes: true });
const validateShopItem = ajv.compile({
  type: "object",
  additionalProperties: false,
  properties: {
    shopId: { type: "string" },
    name: { type: "string", maxLength: 500 },
    description: { type: "string", maxLength: 5000 },
    price: { type: "integer" },
    type: { type: "string", enum: ["OBJECT", "SERVICE"] },
  },
});

export async function addArticleToShop(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    throw new Error("User not authenticated");
  }

  const shopId = formData.get("shopId") as string;

  if (!shopId) {
    throw new Error("Missing shopId");
  }

  const shop = await db
    .db()
    .collection("shops")
    .findOne({ id: shopId, sellers: new ObjectId(session.user.id) });

  if (!shop) {
    throw new Error("Shop not found or not accessible to user");
  }

  const itemData = {
    name: formData.get("name"),
    description: formData.get("description"),
    price: parseInt(formData.get("price") as string),
    shopId: formData.get("shopId"),
    type: formData.get("type"),
  };

  if (!validateShopItem(itemData)) {
    console.warn({
      errors: validateShopItem.errors,
      message: "Invalid item data",
    });
    throw new Error("Invalid item data");
  }

  const itemId = randomUUID();

  const catalogueSlug = (formData.get("itemSlug") as string | null)?.trim();
  const catalogueItem = catalogueSlug
    ? await getItemBySlug(catalogueSlug)
    : null;

  const location = await findPickupLocation(
    (formData.get("locationId") as string | null)?.trim(),
    session.user.id,
  );

  // L'image envoyée prime ; à défaut, celle du catalogue.
  const imageFile = formData.get("image");
  let image = catalogueItem?.imageUrl ?? "";
  if (imageFile instanceof File && imageFile.size > 0) {
    const imageExtension = imageFile.name.split(".").pop();
    const imageBlob = await put(
      `/items/${itemId}.${imageExtension}`,
      imageFile,
      { access: "public", addRandomSuffix: false },
    );
    image = imageBlob.url;
  }

  const item = {
    id: itemId,
    name: itemData.name,
    description: itemData.description,
    price: itemData.price,
    shopId: itemData.shopId,
    type: itemData.type,
    image,
    stock: 1,
    createdAt: new Date().toISOString(),
    ...(catalogueItem && {
      itemSlug: catalogueItem.slug,
      ...(catalogueItem.category && { category: catalogueItem.category }),
      ...(catalogueItem.manufacturer && {
        manufacturer: catalogueItem.manufacturer,
      }),
      ...(catalogueItem.size !== undefined && { size: catalogueItem.size }),
    }),
    ...(location && { location }),
  };

  await db.db().collection("shopItems").insertOne(item);

  revalidatePath("/shopping");
  return redirect(`/shopping/i/${itemId}`);
}

/**
 * Le lieu de remise choisi, s'il fait partie de ceux que le vendeur peut
 * utiliser : les lieux communs et ceux qu'il a nommés lui-même.
 */
async function findPickupLocation(
  locationId: string | undefined,
  userId: string,
): Promise<ListingLocation | null> {
  if (!locationId || !ObjectId.isValid(locationId)) return null;
  const location = await db
    .db()
    .collection<{ _id: ObjectId; name: string; system?: string; userId?: string }>(
      "locations",
    )
    .findOne({
      _id: new ObjectId(locationId),
      $or: [{ userId: { $exists: false } }, { userId }],
    });
  if (!location) return null;
  return {
    id: location._id.toString(),
    name: location.name,
    ...(location.system && { system: location.system }),
  };
}

export async function incrementShopItemStock(
  itemId: string,
  stockModification: number,
): Promise<{ error?: "INVALID_CHANGE" | "NOT_ENOUGH_STOCK" }> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    throw new Error("User not authenticated");
  }

  if (!Number.isInteger(stockModification) || stockModification === 0) {
    return { error: "INVALID_CHANGE" };
  }

  const item = await db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .findOne({ id: itemId });

  if (!item) {
    throw new Error("Item not found");
  }

  if (!(await isUserSellerOfShop(item.shopId, new ObjectId(session.user.id)))) {
    throw new Error("User is not a seller of the shop");
  }

  // Le filtre empêche un retrait de faire passer le stock sous zéro, même si
  // deux vendeurs le corrigent en même temps.
  const result = await db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .updateOne(
      stockModification < 0
        ? { id: itemId, stock: { $gte: -stockModification } }
        : { id: itemId },
      { $inc: { stock: stockModification } },
    );

  if (result.modifiedCount === 0) {
    return { error: "NOT_ENOUGH_STOCK" };
  }

  revalidatePath(`/shopping/i/${itemId}`);
  revalidatePath(`/shops/${item.shopId}`);
  revalidatePath("/shopping");
  return {};
}
