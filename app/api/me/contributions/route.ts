import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getStanding, listMyContributions } from "@/lib/contributions";

/**
 * GET /api/me/contributions
 * Le niveau du lecteur (`standing`) et ses 50 dernières contributions, la plus
 * récente d'abord, avec leur statut et le motif d'un refus.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = new ObjectId(session.user.id);
  const [standing, contributions] = await Promise.all([
    getStanding(userId),
    listMyContributions(userId),
  ]);

  return NextResponse.json({ standing, contributions });
}
