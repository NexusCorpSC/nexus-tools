"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { roundQty } from "@/lib/utils";

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
