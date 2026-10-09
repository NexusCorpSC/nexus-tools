import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSellerShops } from "@/lib/lot-sales";

/**
 * GET /api/me/shops
 * Les magasins où le lecteur vend, pour mettre un lot de son inventaire en
 * vente ; son magasin par défaut en tête.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ shops: await getSellerShops(session.user.id) });
}
