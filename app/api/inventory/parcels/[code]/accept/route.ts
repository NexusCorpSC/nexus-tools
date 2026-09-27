import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { acceptParcel, ParcelError } from "@/lib/parcels";

/**
 * POST /api/inventory/parcels/:code/accept
 * Body: `{ locationId, orgVisible? }`. Moves the parcel's lots from the
 * sender's inventory to the reader's, at that place, in one transaction; a
 * lot already held there with the same name, quality and unit is topped up.
 * Answers `{ parcel, created, merged }`, or `{ error, item? }`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
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
    const result = await acceptParcel(
      { id: session.user.id, name: session.user.name },
      (await params).code,
      (body ?? {}) as { locationId?: unknown; orgVisible?: unknown },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ParcelError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }
    throw error;
  }
}
