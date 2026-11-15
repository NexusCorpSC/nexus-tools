import { NextRequest, NextResponse } from "next/server";
import { createOffer, type OfferInput } from "@/lib/player-requests";
import {
  readJson,
  requestErrorResponse,
  sessionActor,
  unauthorized,
} from "../../session";

/**
 * POST /api/requests/[id]/offers
 * « J'en ai » : `quantity`, `quality`, `unitPrice`, `inventoryItemId` (un
 * lot qui remplit ce qui manque) et `message`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await sessionActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const body = await readJson(request);
  try {
    const offer = await createOffer(actor, id, body as OfferInput);
    return NextResponse.json(offer, { status: 201 });
  } catch (error) {
    return requestErrorResponse(error);
  }
}
