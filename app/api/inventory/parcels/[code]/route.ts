import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { cancelParcel, ParcelError, previewParcel } from "@/lib/parcels";

type Params = { params: Promise<{ code: string }> };

/**
 * GET /api/inventory/parcels/:code
 * What a parcel holds and who sent it, for the player about to accept it.
 * Only a parcel still waiting is shown; a wrong code counts against the
 * reader's attempts (429 `too_many_attempts` past ten in ten minutes).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(
      await previewParcel(session.user.id, (await params).code),
    );
  } catch (error) {
    if (error instanceof ParcelError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }
    throw error;
  }
}

/**
 * DELETE /api/inventory/parcels/:code
 * The sender takes back a parcel still waiting: its code stops working, and
 * the reserved quantities are free again.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(
      await cancelParcel(session.user.id, (await params).code),
    );
  } catch (error) {
    if (error instanceof ParcelError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }
    throw error;
  }
}
