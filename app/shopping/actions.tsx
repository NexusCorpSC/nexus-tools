"use server";

import db from "@/lib/db";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import Ajv from "ajv";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import { changeManualStock, type StockError } from "@/lib/shop-stock";
import {
  findPickupLocation,
  isUserSellerOfShop,
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
    stock: initialStock(formData.get("stock")),
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

/** La quantité saisie à la création ; une unité si le champ manque. */
function initialStock(value: FormDataEntryValue | null): number {
  if (value === null) return 1;
  const stock = Number(value);
  return Number.isInteger(stock) && stock >= 0 && stock <= 1_000_000
    ? stock
    : 1;
}

export async function incrementShopItemStock(
  itemId: string,
  stockModification: number,
  note?: string,
): Promise<{ error?: StockError }> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    throw new Error("User not authenticated");
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

  const result = await changeManualStock(item, stockModification, {
    note,
    byName: session.user.name || session.user.email || "?",
  });
  if (result.error) return result;

  revalidatePath(`/shopping/i/${itemId}`);
  revalidatePath(`/shops/${item.shopId}/bo/listings`);
  revalidatePath(`/shops/${item.shopId}/bo/listings/${itemId}`);
  revalidatePath(`/shops/${item.shopId}`);
  revalidatePath("/shopping");
  return {};
}
