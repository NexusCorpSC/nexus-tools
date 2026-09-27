import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createParcel, listParcels, ParcelError } from "@/lib/parcels";

/**
 * GET /api/inventory/parcels
 * The parcels the reader sent or received over the last 30 days, newest
 * first; `direction` tells the two apart.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await listParcels(session.user.id));
}

/**
 * POST /api/inventory/parcels
 * Body: `{ items: { itemId, quantity }[] }`, lots of the reader's. Seals a
 * parcel and answers it with its code (201). The quantities stay in the
 * inventory, reserved, until the parcel is accepted, cancelled or expires.
 * Refusals answer `{ error, item? }` — see `ParcelErrorCode`.
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

  try {
    const parcel = await createParcel(
      { id: session.user.id, name: session.user.name },
      (body as { items?: unknown } | null)?.items,
    );
    return NextResponse.json(parcel, { status: 201 });
  } catch (error) {
    if (error instanceof ParcelError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }
    throw error;
  }
}
