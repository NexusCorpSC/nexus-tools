import "server-only";

import { ObjectId } from "bson";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import db from "@/lib/db";
import type { ShopDbModel } from "@/lib/shop-items";
import {
  SHOP_DESCRIPTION_MAX,
  SHOP_LOGO_MAX_BYTES,
  SHOP_NAME_MAX,
  SHOP_NAME_MIN,
} from "@/lib/shop-limits";

/**
 * Les magasins ouverts par les joueurs eux-mêmes : tout joueur connecté en
 * ouvre un, dont il est le propriétaire et le premier vendeur. Un magasin
 * qui pose problème se signale (`lib/reports.ts`) et la modération le masque.
 */

/** Combien de magasins un joueur peut posséder ; il peut vendre dans d'autres. */
export const MAX_OWNED_SHOPS = 1;

const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ShopFormError =
  | "NAME_LENGTH"
  | "NAME_TAKEN"
  | "DESCRIPTION_LENGTH"
  | "LOGO_INVALID"
  | "TOO_MANY_SHOPS";

function shops() {
  return db.db().collection<ShopDbModel>("shops");
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Le nom, sans espaces superflus. */
export function cleanShopName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Deux magasins ne portent pas le même nom, à la casse près. */
export async function isShopNameTaken(
  name: string,
  exceptShopId?: string,
): Promise<boolean> {
  const taken = await shops().findOne(
    {
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
      ...(exceptShopId && { id: { $ne: exceptShopId } }),
    },
    { projection: { _id: 1 } },
  );
  return !!taken;
}

export async function countOwnedShops(userId: ObjectId): Promise<number> {
  return shops().countDocuments({ ownerId: userId });
}

/** Vérifie le nom et la description saisis ; renvoie la première erreur. */
export async function checkShopFields(
  name: string,
  description: string,
  exceptShopId?: string,
): Promise<ShopFormError | null> {
  if (name.length < SHOP_NAME_MIN || name.length > SHOP_NAME_MAX) {
    return "NAME_LENGTH";
  }
  if (description.length > SHOP_DESCRIPTION_MAX) return "DESCRIPTION_LENGTH";
  if (await isShopNameTaken(name, exceptShopId)) return "NAME_TAKEN";
  return null;
}

/** Le logo envoyé, s'il est une image acceptée ; `null` sinon. */
export function checkLogo(file: unknown): File | null | "invalid" {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!LOGO_TYPES[file.type] || file.size > SHOP_LOGO_MAX_BYTES) {
    return "invalid";
  }
  return file;
}

export async function uploadShopLogo(shopId: string, file: File) {
  const blob = await put(
    `/shops/${shopId}/logo-${Date.now()}.${LOGO_TYPES[file.type]}`,
    file,
    { access: "public", addRandomSuffix: false },
  );
  return blob.url;
}

/**
 * Ouvre un magasin : le joueur en est le propriétaire et le premier vendeur,
 * et le magasin devient celui que propose « Vendre un objet ».
 */
export async function createShop({
  ownerId,
  name,
  description,
  logo,
}: {
  ownerId: ObjectId;
  name: string;
  description: string;
  logo?: File;
}): Promise<{ id?: string; error?: ShopFormError }> {
  if ((await countOwnedShops(ownerId)) >= MAX_OWNED_SHOPS) {
    return { error: "TOO_MANY_SHOPS" };
  }
  const invalid = await checkShopFields(name, description);
  if (invalid) return { error: invalid };

  const id = randomUUID();
  const doc: ShopDbModel = {
    _id: new ObjectId(),
    id,
    ownerId,
    name,
    description,
    sellers: [ownerId],
    createdAt: new Date().toISOString(),
  };
  if (logo) doc.logo = await uploadShopLogo(id, logo);
  await shops().insertOne(doc);

  await db
    .db()
    .collection<{ _id: ObjectId; defaultShopId?: string }>("users")
    .updateOne(
      { _id: ownerId, defaultShopId: { $exists: false } },
      { $set: { defaultShopId: id } },
    );

  return { id };
}

export type UserMatch = { id: string; name: string; avatar?: string };

/**
 * Les joueurs dont le pseudo commence par ce texte, pour ajouter un vendeur
 * sans recopier son identifiant. Trois lettres au moins, huit réponses au
 * plus : on retrouve quelqu'un qu'on connaît, on ne parcourt pas la liste.
 */
export async function searchUsersByName(
  query: string,
  exclude: ObjectId[],
): Promise<UserMatch[]> {
  const text = query.trim();
  if (text.length < 3) return [];
  const docs = await db
    .db()
    .collection<{ _id: ObjectId; name?: string; avatar?: string; image?: string }>(
      "users",
    )
    .find(
      {
        name: { $regex: `^${escapeRegex(text)}`, $options: "i" },
        _id: { $nin: exclude },
      },
      { projection: { name: 1, avatar: 1, image: 1 } },
    )
    .sort({ name: 1 })
    .limit(8)
    .toArray();
  return docs.map((doc) => ({
    id: doc._id.toString(),
    name: doc.name ?? "?",
    ...((doc.avatar || doc.image) && { avatar: doc.avatar || doc.image }),
  }));
}
