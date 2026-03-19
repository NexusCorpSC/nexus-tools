import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { roundQty } from "@/lib/utils";

type Params = { params: Promise<{ itemId: string }> };

/** Resolve item and assert ownership. Returns null if not found or id is invalid. */
async function resolveItem(itemId: string, userId: string) {
  let oid: ObjectId;
  try {
    oid = new ObjectId(itemId);
  } catch {
    return null;
  }
  const item = await db
    .db()
    .collection("inventoryItems")
    .findOne({ _id: oid, userId });
  return item ?? null;
}

/** PATCH /api/inventory/items/[itemId]
 * Supports three operation modes via body.op:
 *  - "update": full update of editable fields
 *  - "adjust": adjust quantity by delta (positive or negative)
 *  - "move":   change locationId
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { op } = body as Record<string, unknown>;

  const item = await resolveItem(itemId, session.user.id);
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (op === "adjust") {
    const { delta } = body as Record<string, unknown>;
    if (typeof delta !== "number" || isNaN(delta)) {
      return NextResponse.json(
        { error: "delta must be a number" },
        { status: 400 }
      );
    }
    const newQty = roundQty((item.quantity as number) + delta);
    if (newQty < 0) {
      return NextResponse.json(
        { error: "quantity cannot be negative" },
        { status: 400 }
      );
    }
    await db
      .db()
      .collection("inventoryItems")
      .updateOne(
        { _id: item._id },
        { $set: { quantity: newQty, updatedAt: now } }
      );
    return NextResponse.json({ quantity: newQty });
  }

  if (op === "move") {
    const { locationId } = body as Record<string, unknown>;
    if (typeof locationId !== "string" || !locationId.trim()) {
      return NextResponse.json(
        { error: "locationId is required" },
        { status: 400 }
      );
    }
    await db
      .db()
      .collection("inventoryItems")
      .updateOne(
        { _id: item._id },
        { $set: { locationId: locationId.trim(), updatedAt: now } }
      );
    return NextResponse.json({ ok: true });
  }

  if (op === "update") {
    const { name, description, quality, quantity, unit, locationId } =
      body as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof quantity !== "number" || isNaN(quantity)) {
      return NextResponse.json(
        { error: "quantity must be a number" },
        { status: 400 }
      );
    }
    if (typeof locationId !== "string" || !locationId.trim()) {
      return NextResponse.json(
        { error: "locationId is required" },
        { status: 400 }
      );
    }
    if (
      quality !== undefined &&
      quality !== null &&
      (typeof quality !== "number" ||
        !Number.isInteger(quality) ||
        quality < 0)
    ) {
      return NextResponse.json(
        { error: "quality must be a non-negative integer" },
        { status: 400 }
      );
    }

    await db
      .db()
      .collection("inventoryItems")
      .updateOne(
        { _id: item._id },
        {
          $set: {
            name: (name as string).trim(),
            description:
              typeof description === "string"
                ? description.trim() || undefined
                : undefined,
            quality:
              quality !== undefined && quality !== null
                ? (quality as number)
                : undefined,
            quantity: quantity as number,
            unit:
              typeof unit === "string" ? unit.trim() || undefined : undefined,
            locationId: (locationId as string).trim(),
            updatedAt: now,
          },
        }
      );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown op" }, { status: 400 });
}

/** DELETE /api/inventory/items/[itemId] */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await params;

  let oid: ObjectId;
  try {
    oid = new ObjectId(itemId);
  } catch {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const result = await db
    .db()
    .collection("inventoryItems")
    .deleteOne({ _id: oid, userId: session.user.id });

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
