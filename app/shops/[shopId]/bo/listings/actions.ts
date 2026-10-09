"use server";

import { ObjectId } from "bson";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  findPickupLocation,
  isUserSellerOfShop,
  type ShopItemDbModel,
} from "@/lib/shop-items";
import { isListingInOpenOrder } from "@/lib/shop-orders";
import {
  linkLot,
  type LotSummary,
  searchOwnLots,
  setLotLimit,
  type StockError,
  unlinkLot,
} from "@/lib/shop-stock";

const MAX_NAME = 500;
const MAX_DESCRIPTION = 5000;

function listings() {
  return db.db().collection<ShopItemDbModel>("shopItems");
}

/** L'annonce, si celui qui agit vend pour son magasin. */
async function requireListingSeller(itemId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("NOT_AUTHENTICATED");
  const listing = await listings().findOne({ id: itemId });
  if (
    !listing ||
    !(await isUserSellerOfShop(listing.shopId, new ObjectId(session.user.id)))
  ) {
    throw new Error("NOT_ALLOWED");
  }
  return {
    listing,
    userId: session.user.id,
    byName: session.user.name || session.user.email || "?",
  };
}

function revalidateListing(listing: ShopItemDbModel) {
  revalidatePath(`/shops/${listing.shopId}/bo/listings`);
  revalidatePath(`/shops/${listing.shopId}/bo/listings/${listing.id}`);
  revalidatePath(`/shopping/i/${listing.id}`);
  revalidatePath(`/shops/${listing.shopId}`);
  revalidatePath("/shopping");
}

export type ListingUpdateError = "NAME_REQUIRED" | "INVALID_PRICE";

/** Le nom, la description, le prix et le lieu de remise d'une annonce. */
export async function updateListingAction(
  itemId: string,
  input: {
    name: string;
    description: string;
    price: number;
    locationId?: string;
  },
): Promise<{ error?: ListingUpdateError }> {
  const { listing, userId } = await requireListingSeller(itemId);

  const name = input.name.trim().slice(0, MAX_NAME);
  if (!name) return { error: "NAME_REQUIRED" };
  if (!Number.isInteger(input.price) || input.price < 0) {
    return { error: "INVALID_PRICE" };
  }

  const set: Partial<ShopItemDbModel> = {
    name,
    description: input.description.trim().slice(0, MAX_DESCRIPTION),
    // Le prix est un nombre depuis la refonte ; les anciennes annonces
    // l'avaient en texte, et le type du modèle l'a gardé.
    price: input.price as unknown as string,
  };
  const unset: Record<string, ""> = {};
  // Une annonce reliée à un lot prend le lieu du lot.
  if (!listing.inventoryItemId) {
    const locationId = input.locationId?.trim();
    if (!locationId) {
      unset.location = "";
    } else if (locationId !== listing.location?.id) {
      const location = await findPickupLocation(locationId, userId);
      if (location) set.location = location;
    }
  }

  await listings().updateOne(
    { id: itemId },
    { $set: set, ...(Object.keys(unset).length > 0 && { $unset: unset }) },
  );
  revalidateListing(listing);
  return {};
}

/** Retire l'annonce de la vente, ou l'y remet ; les vendeurs la voient toujours. */
export async function setListingHiddenAction(
  itemId: string,
  hidden: boolean,
): Promise<void> {
  const { listing } = await requireListingSeller(itemId);
  await listings().updateOne(
    { id: itemId },
    hidden ? { $set: { hidden: true } } : { $unset: { hidden: "" } },
  );
  revalidateListing(listing);
}

/**
 * Supprime l'annonce. Une annonce engagée dans une commande en cours reste :
 * on la retire de la vente en attendant.
 */
export async function deleteListingAction(
  itemId: string,
): Promise<{ error?: "OPEN_ORDERS" }> {
  const { listing } = await requireListingSeller(itemId);
  if (await isListingInOpenOrder(itemId)) return { error: "OPEN_ORDERS" };
  await listings().deleteOne({ id: itemId });
  revalidateListing(listing);
  redirect(`/shops/${listing.shopId}/bo/listings`);
}

/** Les lots de mon inventaire qu'une annonce peut suivre. */
export async function searchLotsAction(
  itemId: string,
  query: string,
): Promise<LotSummary[]> {
  const { userId } = await requireListingSeller(itemId);
  return searchOwnLots(userId, query.slice(0, 100));
}

export async function linkLotAction(
  itemId: string,
  lotId: string,
): Promise<{ error?: StockError }> {
  const { listing, userId, byName } = await requireListingSeller(itemId);
  const result = await linkLot(listing, lotId, { userId, byName });
  if (!result.error) revalidateListing(listing);
  return result;
}

export async function unlinkLotAction(itemId: string): Promise<void> {
  const { listing, byName } = await requireListingSeller(itemId);
  await unlinkLot(listing, { byName });
  revalidateListing(listing);
}

/** Le plafond du lot suivi, ou `null` pour proposer tout le lot. */
export async function setLotLimitAction(
  itemId: string,
  limit: number | null,
): Promise<{ error?: StockError }> {
  const { listing } = await requireListingSeller(itemId);
  const result = await setLotLimit(listing, limit);
  if (!result.error) revalidateListing(listing);
  return result;
}
