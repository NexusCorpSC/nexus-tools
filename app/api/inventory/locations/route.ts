import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";

/**
 * GET /api/inventory/locations
 * Returns locations available to the current user:
 * - Generic locations (no userId)
 * - Locations owned by the user (userId === session.user.id)
 * Supports ?query= for autocomplete filtering.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("query") || "";

  const matchStage: Record<string, unknown> = {
    $or: [{ userId: { $exists: false } }, { userId: session.user.id }],
  };

  if (query) {
    matchStage.name = { $regex: query, $options: "i" };
  }

  const locations = await db
    .db()
    .collection("locations")
    .find(matchStage)
    .sort({ name: 1 })
    .limit(30)
    .toArray();

  return NextResponse.json(
    locations.map((loc) => ({
      id: loc._id.toString(),
      name: loc.name,
      slug: loc.slug,
      system: loc.system,
      userId: loc.userId,
    }))
  );
}

/**
 * POST /api/inventory/locations
 * Creates a new user-specific location.
 */
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

  const { name } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const doc = {
    _id: new ObjectId(),
    name: (name as string).trim(),
    userId: session.user.id,
  };

  await db.db().collection("locations").insertOne(doc);

  return NextResponse.json(
    { id: doc._id.toString(), name: doc.name, userId: doc.userId },
    { status: 201 }
  );
}
