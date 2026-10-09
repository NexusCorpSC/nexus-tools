import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { listInventory } from "@/lib/inventory";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query") || "";
  const locationId = searchParams.get("locationId") || undefined;
  const quality = searchParams.get("quality");

  const result = await listInventory(session.user.id, {
    query,
    locationId,
    minQuality:
      quality !== null && quality !== "" ? parseInt(quality, 10) : undefined,
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, quality, quantity, unit, locationId, orgVisible } =
    body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof quantity !== "number" || isNaN(quantity)) {
    return NextResponse.json(
      { error: "quantity must be a number" },
      { status: 400 },
    );
  }
  if (typeof locationId !== "string" || !locationId.trim()) {
    return NextResponse.json(
      { error: "locationId is required" },
      { status: 400 },
    );
  }
  if (
    quality !== undefined &&
    quality !== null &&
    (typeof quality !== "number" || !Number.isInteger(quality) || quality < 0)
  ) {
    return NextResponse.json(
      { error: "quality must be a non-negative integer" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const doc = {
    _id: new ObjectId(),
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
    unit: typeof unit === "string" ? unit.trim() || undefined : undefined,
    locationId: (locationId as string).trim(),
    userId: session.user.id,
    orgVisible: orgVisible === true,
    updatedAt: now,
  };

  await db.db().collection("inventoryItems").insertOne(doc);

  return NextResponse.json({ id: doc._id.toString() }, { status: 201 });
}
