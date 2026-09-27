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

export type QuickAddRow = {
  name: string;
  quality?: number;
  quantity: number;
  unit?: string;
  locationId: string;
  orgVisible: boolean;
};

export type QuickAddResult =
  | { ok: true; created: number; merged: number }
  | { ok: false; error: string };

/** Beyond this a paste is more likely a mistake than an inventory. */
const QUICK_ADD_LIMIT = 500;

function sameText(a: unknown, b: string | undefined) {
  return (
    (typeof a === "string" ? a.trim().toLowerCase() : "") ===
    (b ?? "").trim().toLowerCase()
  );
}

/**
 * Adds the rows of the quick-add table in one go.
 *
 * A row naming something already held — same name, quality and unit, at the
 * same place — tops that lot up instead of making a second one: typing in
 * what came back from a run should not split a stack in two. Its sharing with
 * the org is left as it was. Anything else becomes a new item.
 *
 * Every row is checked before anything is written, so a bad row refuses the
 * whole batch rather than leaving half of it in.
 */
export async function quickAddItems(
  rows: QuickAddRow[],
): Promise<QuickAddResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Nothing to add" };
  }
  if (rows.length > QUICK_ADD_LIMIT) {
    return { ok: false, error: `At most ${QUICK_ADD_LIMIT} rows at once` };
  }

  for (const row of rows) {
    if (typeof row?.name !== "string" || !row.name.trim()) {
      return { ok: false, error: "name is required" };
    }
    if (
      typeof row.quantity !== "number" ||
      !Number.isFinite(row.quantity) ||
      row.quantity <= 0
    ) {
      return { ok: false, error: "quantity must be a positive number" };
    }
    if (
      row.quality !== undefined &&
      (!Number.isInteger(row.quality) || row.quality < 0)
    ) {
      return { ok: false, error: "quality must be a non-negative integer" };
    }
    if (typeof row.locationId !== "string" || !row.locationId.trim()) {
      return { ok: false, error: "locationId is required" };
    }
  }

  const userId = session.user.id;
  const collection = db.db().collection("inventoryItems");
  const now = new Date().toISOString();

  // What the reader already holds at each place the rows name, kept up to
  // date as rows land so that two identical rows make one lot.
  const held = new Map<string, Record<string, unknown>[]>();
  let created = 0;
  let merged = 0;

  for (const row of rows) {
    const locationId = row.locationId.trim();
    const name = row.name.trim();
    const unit = row.unit?.trim() || undefined;

    let here = held.get(locationId);
    if (!here) {
      here = await collection.find({ userId, locationId }).toArray();
      held.set(locationId, here);
    }

    const match = here.find(
      (item) =>
        sameText(item.name, name) &&
        sameText(item.unit, unit) &&
        (item.quality ?? undefined) === row.quality,
    );

    if (match) {
      const quantity = roundQty((match.quantity as number) + row.quantity);
      await collection.updateOne(
        { _id: match._id as ObjectId },
        { $set: { quantity, updatedAt: now } },
      );
      match.quantity = quantity;
      merged += 1;
      continue;
    }

    const doc = {
      _id: new ObjectId(),
      name,
      quality: row.quality,
      quantity: row.quantity,
      unit,
      locationId,
      userId,
      orgVisible: row.orgVisible === true,
      updatedAt: now,
    };
    await collection.insertOne(doc);
    here.push(doc);
    created += 1;
  }

  return { ok: true, created, merged };
}
