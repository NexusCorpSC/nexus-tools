import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { sellLot } from "@/lib/lot-sales";

/**
 * POST /api/me/listings
 * Met un lot de l'inventaire du lecteur en vente dans un de ses magasins :
 * `{ lotId, shopId, name, price, limit?, publish? }`. L'annonce suit le lot ;
 * `limit` plafonne la part proposée, `publish: false` la laisse retirée de la
 * vente. Réponse : `{ listingId }`, ou `{ error }` avec un code
 * (`SellLotError`).
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const result = await sellLot(
    {
      id: session.user.id,
      name: session.user.name || session.user.email || "?",
    },
    {
      lotId: String(body.lotId ?? ""),
      shopId: String(body.shopId ?? ""),
      name: String(body.name ?? ""),
      price: typeof body.price === "number" ? body.price : NaN,
      limit:
        body.limit === undefined || body.limit === null
          ? null
          : typeof body.limit === "number"
            ? body.limit
            : NaN,
      publish: body.publish !== false,
    },
  );
  if (result.error) {
    const status =
      result.error === "SHOP_NOT_FOUND" || result.error === "LOT_NOT_FOUND"
        ? 404
        : result.error === "ALREADY_ON_SALE"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  revalidatePath("/shopping");
  return NextResponse.json({ listingId: result.listingId }, { status: 201 });
}
