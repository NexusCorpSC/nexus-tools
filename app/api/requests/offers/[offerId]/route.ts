import { NextRequest, NextResponse } from "next/server";
import {
  actOnOffer,
  postOfferMessage,
  type OfferActionInput,
} from "@/lib/player-requests";
import { isOfferAction } from "@/types/requests";
import {
  readJson,
  requestErrorResponse,
  sessionActor,
  unauthorized,
} from "../../session";

/**
 * POST /api/requests/offers/[offerId]
 * Dans le fil d'une offre : `action: "message"` avec `body`, ou une action
 * (`keep`, `decline`, `receive`, `withdraw`, `price`) avec `unitPrice`,
 * `quantity`, `message` et `addToInventory` { locationId } selon le cas.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const actor = await sessionActor();
  if (!actor) return unauthorized();
  const { offerId } = await params;
  const body = await readJson(request);
  try {
    if (body.action === "message") {
      return NextResponse.json({
        offer: await postOfferMessage(actor, offerId, body.body),
      });
    }
    if (!isOfferAction(body.action)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    return NextResponse.json(
      await actOnOffer(actor, offerId, body.action, body as OfferActionInput),
    );
  } catch (error) {
    return requestErrorResponse(error);
  }
}
