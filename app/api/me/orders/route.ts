import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getAppOrders } from "@/lib/app-orders";

/**
 * GET /api/me/orders?since=<ISO>
 * Les commandes du lecteur pour l'app : celles qu'il a passées, celles que
 * reçoivent les magasins où il vend, et, depuis `since`, les commandes
 * reçues et les étapes franchies par l'autre partie. L'app renvoie `now`
 * comme prochain `since`.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawSince = request.nextUrl.searchParams.get("since");
  const since = rawSince ? new Date(rawSince) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Invalid since" }, { status: 400 });
  }

  const summary = await getAppOrders(
    new ObjectId(session.user.id),
    since?.toISOString(),
  );
  return NextResponse.json(summary);
}
