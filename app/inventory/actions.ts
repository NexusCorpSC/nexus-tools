"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { roundQty } from "@/lib/utils";
import {
  addInventoryRows,
  type QuickAddResult,
  type QuickAddRow,
} from "@/lib/inventory-quick-add";
import {
  acceptParcel,
  cancelParcel,
  createParcel,
  listParcels,
  ParcelError,
  previewParcel,
  type ParcelErrorCode,
} from "@/lib/parcels";

export type PackageEntry = { itemId: string; quantity: number };
export type PackageOp =
  | { type: "delete" }
  | { type: "move"; locationId: string };

export async function packageOperate(
  entries: PackageEntry[],
  op: PackageOp
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  const userId = session.user.id;
  const collection = db.db().collection("inventoryItems");
  const now = new Date().toISOString();

  for (const { itemId, quantity } of entries) {
    if (!quantity || quantity <= 0) continue;

    let oid: ObjectId;
    try {
      oid = new ObjectId(itemId);
    } catch {
      continue;
    }

    const item = await collection.findOne({ _id: oid, userId });
    if (!item) continue;

    if (op.type === "delete") {
      const remaining = roundQty((item.quantity as number) - quantity);
      if (remaining <= 0) {
        await collection.deleteOne({ _id: oid });
      } else {
        await collection.updateOne(
          { _id: oid },
          { $set: { quantity: remaining, updatedAt: now } }
        );
      }
    } else if (op.type === "move") {
      // Skip if source and target are the same location
      if (item.locationId === op.locationId) continue;

      // Subtract from source
      const remaining = roundQty((item.quantity as number) - quantity);
      if (remaining <= 0) {
        await collection.deleteOne({ _id: oid });
      } else {
        await collection.updateOne(
          { _id: oid },
          { $set: { quantity: remaining, updatedAt: now } }
        );
      }

      // Create new entry at target location (no auto-merge for predictability)
      await collection.insertOne({
        _id: new ObjectId(),
        name: item.name,
        description: item.description,
        quality: item.quality,
        quantity,
        unit: item.unit,
        locationId: op.locationId,
        userId,
        updatedAt: now,
      });
    }
  }

  return { ok: true };
}


/** The quick-add table's rows, for the reader: see `addInventoryRows`. */
export async function quickAddItems(
  rows: QuickAddRow[],
): Promise<QuickAddResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };
  return addInventoryRows(session.user.id, rows);
}

export type ParcelActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: ParcelErrorCode | "unauthorized"; item?: string };

async function parcelAction<T>(
  run: (user: { id: string; name?: string }) => Promise<T>,
): Promise<ParcelActionResult<T>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "unauthorized" };
  try {
    return {
      ok: true,
      ...(await run({ id: session.user.id, name: session.user.name })),
    };
  } catch (error) {
    if (error instanceof ParcelError) {
      return { ok: false, error: error.code, item: error.item };
    }
    throw error;
  }
}

/** Seals the reader's package into a parcel: see `createParcel`. */
export async function sendParcel(entries: PackageEntry[]) {
  return parcelAction(async (user) => ({
    parcel: await createParcel(user, entries),
  }));
}

/** What a code holds, before accepting it: see `previewParcel`. */
export async function lookupParcel(code: string) {
  return parcelAction(async (user) => ({
    parcel: await previewParcel(user.id, code),
  }));
}

/** Takes a parcel into the reader's inventory: see `acceptParcel`. */
export async function receiveParcel(
  code: string,
  locationId: string,
  orgVisible: boolean,
) {
  return parcelAction((user) =>
    acceptParcel(user, code, { locationId, orgVisible }),
  );
}

/** Takes back a parcel the reader sent: see `cancelParcel`. */
export async function withdrawParcel(code: string) {
  return parcelAction(async (user) => ({
    parcel: await cancelParcel(user.id, code),
  }));
}

/** The reader's parcels, sent and received: see `listParcels`. */
export async function myParcels() {
  return parcelAction(async (user) => ({
    parcels: await listParcels(user.id),
  }));
}
