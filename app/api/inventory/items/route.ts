import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query") || "";
  const locationId = searchParams.get("locationId") || undefined;
  const quality = searchParams.get("quality");

  const userId = session.user.id;

  const matchStage: Record<string, unknown> = { userId };

  if (query) {
    matchStage.name = { $regex: query, $options: "i" };
  }
  if (locationId) {
    matchStage.locationId = locationId;
  }
  if (quality !== null && quality !== undefined && quality !== "") {
    matchStage.quality = { $gte: parseInt(quality, 10) };
  }

  const items = await db
    .db()
    .collection("inventoryItems")
    .aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "locations",
          let: { locationId: "$locationId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$_id" }, "$$locationId"],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "locationData",
        },
      },
      {
        $addFields: {
          location: { $arrayElemAt: ["$locationData", 0] },
        },
      },
      { $unset: "locationData" },
      { $sort: { updatedAt: -1 } },
    ])
    .toArray();

  const result = items.map((item) => ({
    id: item._id.toString(),
    name: item.name,
    description: item.description,
    quality: item.quality,
    quantity: item.quantity,
    unit: item.unit,
    locationId: item.locationId,
    userId: item.userId,
    updatedAt: item.updatedAt,
    orgVisible: item.orgVisible === true,
    location: item.location
      ? {
          id: item.location._id.toString(),
          name: item.location.name,
          slug: item.location.slug,
          system: item.location.system,
          userId: item.location.userId,
        }
      : null,
  }));

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
    (typeof quality !== "number" || !Number.isInteger(quality) || quality < 0)
  ) {
    return NextResponse.json(
      { error: "quality must be a non-negative integer" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const doc = {
    _id: new ObjectId(),
    name: (name as string).trim(),
    description:
      typeof description === "string" ? description.trim() || undefined : undefined,
    quality:
      quality !== undefined && quality !== null ? (quality as number) : undefined,
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
