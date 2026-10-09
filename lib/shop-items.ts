import "server-only";

import { ObjectId } from "bson";
import db from "@/lib/db";

/** Le lieu de remise d'une annonce, recopié de la collection `locations`. */
export type ListingLocation = {
  id: string;
  name: string;
  system?: string;
};

/** Ce qui reste à vendre : le stock moins ce que des commandes réservent. */
export const AVAILABLE_STOCK = {
  $subtract: ["$stock", { $ifNull: ["$reserved", 0] }],
};

/** Filtre des annonces qu'on peut encore commander. */
export const IN_STOCK = { $expr: { $gte: [AVAILABLE_STOCK, 1] } };

export type ShopItem = {
  id: string;
  name: string;
  type: "OBJECT" | "SERVICE";
  description: string;
  image: string;
  price: string;
  stock: number;
  /** Quantité réservée par des commandes confirmées. */
  reserved?: number;
  createdAt: string;
  /** L'objet du catalogue vendu, quand le vendeur l'a choisi. */
  itemSlug?: string;
  /** Recopiés du catalogue à la création, pour filtrer sans jointure. */
  category?: string;
  manufacturer?: string;
  size?: number;
  /** Où l'objet est remis. */
  location?: ListingLocation;
  /** Stock moins réservé, calculé par la recherche. */
  available?: number;
  hidden?: boolean;
  reportHidden?: boolean;
  inventoryItemId?: string;
  lotLimit?: number;
  lotMissing?: boolean;
  shop: {
    id: string;
    name: string;
    logo?: string;
    reportHidden?: boolean;
  };
};

export type ShopItemDbModel = {
  _id: ObjectId;
  id: string;
  name: string;
  type: "OBJECT" | "SERVICE";
  description: string;
  image: string;
  price: string;
  stock: number;
  /** Quantité réservée par des commandes confirmées. */
  reserved?: number;
  shopId: string;
  createdAt: string;
  /** L'objet du catalogue vendu, quand le vendeur l'a choisi. */
  itemSlug?: string;
  /** Recopiés du catalogue à la création, pour filtrer sans jointure. */
  category?: string;
  manufacturer?: string;
  size?: number;
  /** Où l'objet est remis. */
  location?: ListingLocation;
  /** Retirée de la vente par un vendeur : seuls les vendeurs la voient. */
  hidden?: boolean;
  /** Masquée par un dossier de signalement, en attente ou retirée. */
  reportHidden?: boolean;
  /**
   * Le lot de l'inventaire personnel que l'annonce suit : son stock et son
   * lieu viennent du lot (voir `lib/shop-stock.ts`).
   */
  inventoryItemId?: string;
  /**
   * Le plafond d'une annonce reliée : ce qu'elle peut encore vendre du lot,
   * réservé compris. Il baisse à chaque remise ; absent, tout le lot se vend.
   */
  lotLimit?: number;
  /** Le lot suivi a disparu de l'inventaire : plus rien n'est disponible. */
  lotMissing?: boolean;
};

export type Shop = {
  id: string;
  owner: {
    id: ObjectId;
    name: string;
  };
  name: string;
  description: string;
  logo?: string;
  reportHidden?: boolean;
};

export type ShopDbModel = {
  _id: ObjectId;
  id: string;
  ownerId: ObjectId;
  name: string;
  description: string;
  sellers: ObjectId[];
  /** L'image du magasin ; sans elle, ses initiales. */
  logo?: string;
  createdAt?: string;
  /** Masqué par un dossier de signalement, en attente ou retiré. */
  reportHidden?: boolean;
};

/** Une annonce en vente : ni retirée par ses vendeurs, ni masquée. */
export const LISTING_ON_SALE = {
  hidden: { $ne: true },
  reportHidden: { $ne: true },
};

/** Les magasins masqués par la modération : leurs annonces disparaissent. */
export async function getHiddenShopIds(): Promise<string[]> {
  return db
    .db()
    .collection<ShopDbModel>("shops")
    .distinct("id", { reportHidden: true });
}

/** Le filtre des annonces que le public voit sur la marketplace. */
export async function publicListingFilter(): Promise<Record<string, unknown>> {
  const hiddenShops = await getHiddenShopIds();
  return {
    ...LISTING_ON_SALE,
    ...(hiddenShops.length > 0 && { shopId: { $nin: hiddenShops } }),
  };
}

/** L'annonce se vend-elle encore, elle et son magasin ? */
export function isListingOnSale(
  listing: { hidden?: boolean; reportHidden?: boolean },
  shop?: { reportHidden?: boolean } | null,
): boolean {
  return !listing.hidden && !listing.reportHidden && !shop?.reportHidden;
}

export const LISTING_SORTS = ["recent", "priceAsc", "priceDesc"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export type ListingFilters = {
  query?: string;
  type?: "OBJECT" | "SERVICE";
  category?: string;
  /** Un ou plusieurs systèmes de remise. */
  systems?: string[];
  minPrice?: number;
  maxPrice?: number;
  size?: number;
  /** Vrai : les annonces épuisées sont montrées aussi. */
  includeSoldOut?: boolean;
  sort?: ListingSort;
};

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Le prix est parfois un texte dans les anciennes annonces. */
const PRICE_VALUE = {
  $convert: { input: "$price", to: "double", onError: 0, onNull: 0 },
};

const SORT_STAGES: Record<ListingSort, Record<string, 1 | -1>> = {
  recent: { createdAt: -1, id: 1 },
  priceAsc: { priceValue: 1, createdAt: -1, id: 1 },
  priceDesc: { priceValue: -1, createdAt: -1, id: 1 },
};

/** Les annonces qui répondent aux filtres de la marketplace. */
export async function searchListings(
  filters: ListingFilters,
  { offset, limit }: { offset: number; limit: number },
): Promise<{ items: ShopItem[]; total: number; shopCount: number }> {
  const match: Record<string, unknown> = await publicListingFilter();
  const exprs: unknown[] = [];
  if (!filters.includeSoldOut) exprs.push(IN_STOCK.$expr);
  if (filters.minPrice !== undefined) {
    exprs.push({ $gte: [PRICE_VALUE, filters.minPrice] });
  }
  if (filters.maxPrice !== undefined) {
    exprs.push({ $lte: [PRICE_VALUE, filters.maxPrice] });
  }
  if (exprs.length > 0) match.$expr = { $and: exprs };
  const query = filters.query?.trim();
  if (query) match.name = { $regex: escapeRegex(query), $options: "i" };
  if (filters.type) match.type = filters.type;
  if (filters.category) match.category = filters.category;
  if (filters.systems?.length) {
    match["location.system"] = { $in: filters.systems };
  }
  if (filters.size !== undefined) match.size = filters.size;

  const collection = db.db().collection("shopItems");
  const [items, total, shopIds] = await Promise.all([
    collection
      .aggregate<ShopItem>([
        { $match: match },
        {
          $addFields: { priceValue: PRICE_VALUE, available: AVAILABLE_STOCK },
        },
        { $sort: SORT_STAGES[filters.sort ?? "recent"] },
        { $skip: offset },
        { $limit: limit },
        {
          $lookup: {
            from: "shops",
            localField: "shopId",
            foreignField: "id",
            as: "shop",
            pipeline: [{ $project: { _id: 0, id: 1, name: 1 } }],
          },
        },
        { $unwind: "$shop" },
      ])
      .toArray(),
    collection.countDocuments(match),
    collection.distinct("shopId", match),
  ]);
  return { items, total, shopCount: shopIds.length };
}

/** Les catégories, systèmes et tailles proposés par les annonces en stock. */
export async function getListingFacets(): Promise<{
  categories: string[];
  systems: string[];
  sizes: number[];
}> {
  const collection = db.db().collection("shopItems");
  const onSale = { ...(await publicListingFilter()), ...IN_STOCK };
  const [categories, systems, sizes] = await Promise.all([
    collection.distinct("category", onSale),
    collection.distinct("location.system", onSale),
    collection.distinct("size", onSale),
  ]);
  const clean = (values: unknown[]) =>
    values
      .filter((value): value is string => typeof value === "string" && !!value)
      .sort((a, b) => a.localeCompare(b));
  return {
    categories: clean(categories),
    systems: clean(systems),
    sizes: sizes
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b),
  };
}

export type ShopSummary = {
  id: string;
  name: string;
  /** Annonces encore en stock. */
  itemCount: number;
  /** Le système où le magasin remet le plus souvent. */
  system?: string;
  logo?: string;
};

/** Les magasins, ceux qui ont le plus d'annonces en stock d'abord. */
export async function getShopSummaries(limit: number): Promise<ShopSummary[]> {
  return db
    .db()
    .collection("shops")
    .aggregate<ShopSummary & { systems?: (string | null)[] }>([
      { $match: { reportHidden: { $ne: true } } },
      {
        $lookup: {
          from: "shopItems",
          localField: "id",
          foreignField: "shopId",
          as: "items",
          pipeline: [
            { $match: { ...LISTING_ON_SALE, ...IN_STOCK } },
            { $project: { _id: 0, system: "$location.system" } },
          ],
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          name: 1,
          logo: 1,
          itemCount: { $size: "$items" },
          systems: "$items.system",
        },
      },
      { $sort: { itemCount: -1, name: 1 } },
      { $limit: limit },
    ])
    .toArray()
    .then((shops) =>
      shops.map(({ systems, ...shop }) => ({
        ...shop,
        system: mostFrequent(systems),
      })),
    );
}

function mostFrequent(values: (string | null | undefined)[] = []) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [value, count] of counts) {
    if (!best || count > counts.get(best)!) best = value;
  }
  return best;
}

export async function getShopItem(itemId: string): Promise<ShopItem | null> {
  return db
    .db()
    .collection("shopItems")
    .aggregate<ShopItem>([
      {
        $match: { id: itemId },
      },
      {
        $lookup: {
          from: "shops",
          localField: "shopId",
          foreignField: "id",
          as: "shop",
          pipeline: [
            { $project: { _id: 0, id: 1, name: 1, logo: 1, reportHidden: 1 } },
          ],
        },
      },
      {
        $unwind: "$shop",
      },
    ])
    .next();
}

export async function getShopItemsOfShop(
  shopId: string,
  { offset, limit }: { offset: number; limit: number },
): Promise<ShopItemDbModel[]> {
  return db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .find({ shopId, ...LISTING_ON_SALE })
    .sort({ createdAt: -1, id: 1 })
    .skip(offset)
    .limit(limit)
    .toArray();
}

export async function countShopItems(shopId: string): Promise<number> {
  return db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .countDocuments({ shopId, ...LISTING_ON_SALE });
}

/** Les onglets du tableau des annonces, dans le back-office. */
export const BO_LISTING_STATES = ["active", "soldout", "hidden"] as const;
export type BoListingState = (typeof BO_LISTING_STATES)[number];

const NOT_ON_SALE = {
  $or: [{ hidden: true }, { reportHidden: true }],
};
const SOLD_OUT_EXPR = {
  $and: [
    { $eq: ["$type", "OBJECT"] },
    { $lte: [AVAILABLE_STOCK, 0] },
  ],
};

function boStateFilter(state: BoListingState): Record<string, unknown> {
  switch (state) {
    case "hidden":
      return NOT_ON_SALE;
    case "soldout":
      return { ...LISTING_ON_SALE, $expr: SOLD_OUT_EXPR };
    case "active":
      return { ...LISTING_ON_SALE, $expr: { $not: [SOLD_OUT_EXPR] } };
  }
}

/** Les annonces d'un magasin pour le back-office, filtrées par onglet et par nom. */
export async function getBoListings(
  shopId: string,
  state: BoListingState,
  query?: string,
): Promise<ShopItemDbModel[]> {
  const text = query?.trim();
  return db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .find({
      shopId,
      ...boStateFilter(state),
      ...(text && { name: { $regex: escapeRegex(text), $options: "i" } }),
    })
    .sort({ name: 1, id: 1 })
    .limit(300)
    .toArray();
}

/** Le nombre d'annonces de chaque onglet. */
export async function countBoListings(
  shopId: string,
  query?: string,
): Promise<Record<BoListingState, number>> {
  const text = query?.trim();
  const collection = db.db().collection<ShopItemDbModel>("shopItems");
  const counts = await Promise.all(
    BO_LISTING_STATES.map((state) =>
      collection.countDocuments({
        shopId,
        ...boStateFilter(state),
        ...(text && { name: { $regex: escapeRegex(text), $options: "i" } }),
      }),
    ),
  );
  return Object.fromEntries(
    BO_LISTING_STATES.map((state, index) => [state, counts[index]]),
  ) as Record<BoListingState, number>;
}

/** Toutes les annonces d'un magasin, retirées et masquées comprises. */
export async function countAllShopListings(shopId: string): Promise<number> {
  return db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .countDocuments({ shopId });
}

export async function getShop(shopId: string): Promise<Shop | null> {
  return db
    .db()
    .collection("shops")
    .aggregate<Shop>([
      {
        $match: { id: shopId },
      },
      {
        $lookup: {
          from: "users",
          localField: "ownerId",
          foreignField: "_id",
          as: "owner",
          pipeline: [
            {
              $project: {
                _id: -1,
                name: -1,
              },
            },
          ],
        },
      },
      {
        $unwind: "$owner",
      },
    ])
    .next();
}

export async function getShopSellers(shopId: string): Promise<
  {
    id: string;
    name: string;
  }[]
> {
  const shop = await db
    .db()
    .collection("shops")
    .aggregate<{
      id: string;
      sellers: {
        id: string;
        name: string;
      }[];
    }>([
      {
        $match: { id: shopId },
      },
      {
        $lookup: {
          from: "users",
          localField: "sellers",
          foreignField: "_id",
          as: "sellers",
          pipeline: [
            {
              $project: {
                _id: -1,
                name: -1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          sellers: {
            $map: {
              input: "$sellers",
              as: "seller",
              in: {
                id: {
                  $toString: "$$seller._id",
                },
                name: "$$seller.name",
              },
            },
          },
        },
      },
      {
        $project: {
          "sellers._id": 0,
        },
      },
    ])
    .next();

  if (!shop) {
    throw new Error("Shop not found.");
  }

  return shop.sellers;
}

/** Celui qui a ouvert le magasin : il en reste vendeur. */
export async function getShopOwnerId(shopId: string): Promise<string | null> {
  const shop = await db
    .db()
    .collection<ShopDbModel>("shops")
    .findOne({ id: shopId }, { projection: { ownerId: 1 } });
  return shop?.ownerId?.toString() ?? null;
}

export async function isUserSellerOfShop(shopId: string, userId: ObjectId) {
  const shop = await db
    .db()
    .collection<ShopDbModel>("shops")
    .findOne({ id: shopId, sellers: userId });

  return !!shop;
}

/** Les noms des magasins, pour les listes qui n'ont que leurs identifiants. */
export async function getShopNames(
  shopIds: string[],
): Promise<Map<string, string>> {
  if (shopIds.length === 0) return new Map();
  const shops = await db
    .db()
    .collection<ShopDbModel>("shops")
    .find(
      { id: { $in: [...new Set(shopIds)] } },
      { projection: { id: 1, name: 1 } },
    )
    .toArray();
  return new Map(shops.map((shop) => [shop.id, shop.name]));
}

/**
 * Le lieu de remise choisi, s'il fait partie de ceux que le vendeur peut
 * utiliser : les lieux communs et ceux qu'il a nommés lui-même.
 */
export async function findPickupLocation(
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
