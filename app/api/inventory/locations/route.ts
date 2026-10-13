import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { searchInventoryLocations } from "@/lib/inventory";

/**
 * GET /api/inventory/locations
 * Les lieux où le joueur peut ranger un lot (`searchInventoryLocations`) : le
 * catalogue, les lieux privés qu'il voit (`privatePlaceSlug`), puis les
 * emplacements qu'il a nommés. `?query=` filtre par nom.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("query") || "";
  return NextResponse.json(
    await searchInventoryLocations(session.user.id, query),
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
    { status: 201 },
  );
}
