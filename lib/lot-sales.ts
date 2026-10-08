import "server-only";

import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import type { ShopDbModel, ShopItemDbModel } from "@/lib/shop-items";
import {
  isLotOnSaleInShop,
  isValidLotLimit,
  recordMovement,
  syncLinkedListings,
} from "@/lib/shop-stock";
import type { LotSale, SellerShop } from "@/types/inventory";

/**
 * La mise en vente d'un lot depuis l'inventaire, sur le site comme dans
 * l'app : une annonce d'objet reliée au lot (`inventoryItemId`), avec au
 * besoin un plafond (`lotLimit`). Le stock et le lieu suivent ensuite le lot
 * (voir `lib/shop-stock.ts`). Un lot ne se vend qu'une fois par magasin.
 */

const MAX_NAME = 500;

function listings() {
  return db.db().collection<ShopItemDbModel>("shopItems");
}

function shops() {
  return db.db().collection<ShopDbModel>("shops");
}

/** Les magasins où le joueur vend, son magasin par défaut en tête. */
export async function getSellerShops(userId: string): Promise<SellerShop[]> {
  if (!ObjectId.isValid(userId)) return [];
  const id = new ObjectId(userId);
  const [docs, user] = await Promise.all([
    shops()
      .find({ sellers: id }, { projection: { id: 1, name: 1, logo: 1 } })
      .sort({ name: 1 })
      .toArray(),
    db
      .db()
      .collection<{ _id: ObjectId; defaultShopId?: string }>("users")
      .findOne({ _id: id }, { projection: { defaultShopId: 1 } }),
  ]);
  return docs
    .map((shop) => ({
      id: shop.id,
      name: shop.name,
      ...(shop.logo && { logo: shop.logo }),
      isDefault: shop.id === user?.defaultShopId,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Les annonces qui suivent chacun de ces lots, recalées sur l'inventaire. */
export async function getLotSales(
  lotIds: string[],
): Promise<Map<string, LotSale[]>> {
  const sales = new Map<string, LotSale[]>();
  if (lotIds.length === 0) return sales;

  const filter = { inventoryItemId: { $in: lotIds } };
  await syncLinkedListings(filter);
  const docs = await listings().find(filter).toArray();
  if (docs.length === 0) return sales;

  const shopDocs = await shops()
    .find(
      { id: { $in: [...new Set(docs.map((doc) => doc.shopId))] } },
      { projection: { id: 1, name: 1, reportHidden: 1 } },
    )
    .toArray();
  const shopById = new Map(shopDocs.map((shop) => [shop.id, shop]));

  for (const doc of docs) {
    const shop = shopById.get(doc.shopId);
    if (!shop) continue;
    const list = sales.get(doc.inventoryItemId!) ?? [];
    list.push({
      listingId: doc.id,
      shopId: doc.shopId,
      shopName: shop.name,
      price: Number(doc.price) || 0,
      stock: doc.stock,
      reserved: doc.reserved ?? 0,
      ...(doc.lotLimit !== undefined && { lotLimit: doc.lotLimit }),
      onSale: !doc.hidden && !doc.reportHidden && !shop.reportHidden,
    });
    sales.set(doc.inventoryItemId!, list);
  }
  return sales;
}

export type SellLotError =
  | "SHOP_NOT_FOUND"
  | "LOT_NOT_FOUND"
  | "LOT_EMPTY"
  | "ALREADY_ON_SALE"
  | "NAME_REQUIRED"
  | "INVALID_PRICE"
  | "INVALID_LIMIT";

export type SellLotInput = {
  lotId: string;
  shopId: string;
  name: string;
  price: number;
  /** Au plus tant d'unités du lot ; `null` ou absent : tout le lot. */
  limit?: number | null;
  /** Faux : l'annonce reste retirée de la vente, à finir au back-office. */
  publish: boolean;
};

/** Ce que le lot peut vendre : ni fractions, ni ce que des colis ont promis. */
function sellable(lot: { quantity: number; reserved?: number }): number {
  return Math.max(0, Math.floor(lot.quantity - (lot.reserved ?? 0)));
}

/** La fiche du catalogue qui porte exactement le nom du lot, s'il y en a une. */
async function findCatalogueItem(name: string) {
  return db
    .db()
    .collection<{
      slug: string;
      name: string;
      imageUrl?: string;
      category?: string;
      manufacturer?: string;
      size?: number;
    }>("gameItems")
    .findOne(
      {
        name: {
          $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          $options: "i",
        },
      },
      {
        projection: {
          slug: 1,
          imageUrl: 1,
          category: 1,
          manufacturer: 1,
          size: 1,
        },
      },
    );
}

/** Met un lot de l'inventaire du joueur en vente dans un de ses magasins. */
export async function sellLot(
  user: { id: string; name: string },
  input: SellLotInput,
): Promise<{ listingId?: string; error?: SellLotError }> {
  const name = String(input.name ?? "").trim().slice(0, MAX_NAME);
  if (!name) return { error: "NAME_REQUIRED" };
  if (!Number.isInteger(input.price) || input.price < 0) {
    return { error: "INVALID_PRICE" };
  }
  const limit = input.limit ?? null;
  if (limit !== null && !isValidLotLimit(limit)) {
    return { error: "INVALID_LIMIT" };
  }

  if (!ObjectId.isValid(user.id)) return { error: "SHOP_NOT_FOUND" };
  const shop = await shops().findOne({
    id: input.shopId,
    sellers: new ObjectId(user.id),
  });
  if (!shop) return { error: "SHOP_NOT_FOUND" };

  if (!ObjectId.isValid(input.lotId)) return { error: "LOT_NOT_FOUND" };
  const lot = await db
    .db()
    .collection<{
      _id: ObjectId;
      name: string;
      quantity: number;
      reserved?: number;
      userId: string;
    }>("inventoryItems")
    .findOne({ _id: new ObjectId(input.lotId), userId: user.id });
  if (!lot) return { error: "LOT_NOT_FOUND" };
  if (sellable(lot) < 1) return { error: "LOT_EMPTY" };
  if (await isLotOnSaleInShop(input.lotId, shop.id)) {
    return { error: "ALREADY_ON_SALE" };
  }

  const catalogue = await findCatalogueItem(lot.name);
  const listing: Omit<ShopItemDbModel, "_id"> = {
    id: randomUUID(),
    name,
    type: "OBJECT",
    description: "",
    image: catalogue?.imageUrl ?? "",
    // Le prix est un nombre depuis la refonte ; le type du modèle a gardé
    // le texte des anciennes annonces.
    price: input.price as unknown as string,
    // Le recalage sur le lot pose le stock et le lieu juste après.
    stock: 0,
    shopId: shop.id,
    createdAt: new Date().toISOString(),
    inventoryItemId: input.lotId,
    ...(limit !== null && { lotLimit: limit }),
    ...(!input.publish && { hidden: true }),
    ...(catalogue && {
      itemSlug: catalogue.slug,
      ...(catalogue.category && { category: catalogue.category }),
      ...(catalogue.manufacturer && { manufacturer: catalogue.manufacturer }),
      ...(catalogue.size !== undefined && { size: catalogue.size }),
    }),
  };
  await listings().insertOne(listing as ShopItemDbModel);
  await recordMovement(listing, {
    delta: 0,
    stockAfter: 0,
    source: "link",
    byName: user.name,
    note: lot.name,
  });
  await syncLinkedListings({ id: listing.id });
  return { listingId: listing.id };
}
