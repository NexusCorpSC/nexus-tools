"use server";

import { auth } from "@/auth";
import db from "@/lib/db";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import Ajv from "ajv";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";

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
  const session = await auth();

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

  const imageFile = formData.get("image") as File;
  const imageExtension = imageFile.name.split(".").pop();
  const imageBlob = await put(`/items/${itemId}.${imageExtension}`, imageFile, {
    access: "public",
    addRandomSuffix: false,
  });

  const item = {
    id: itemId,
    name: itemData.name,
    description: itemData.description,
    price: itemData.price,
    shopId: itemData.shopId,
    type: itemData.type,
    image: imageBlob.url,
    stock: 1,
    createdAt: new Date().toISOString(),
  };

  await db.db().collection("shopItems").insertOne(item);

  revalidatePath("/shopping");
  return redirect(`/shopping/i/${itemId}`);
}
