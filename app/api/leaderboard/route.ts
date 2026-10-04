import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getLeaderboard } from "@/lib/gamification";
import { isLeaderboardPeriod, isLeaderboardScope } from "@/types/gamification";

/**
 * GET /api/leaderboard?period=month|all&scope=players|orgs
 * Le classement des contributeurs, ou des organisations publiques par la somme
 * des points de leurs membres. Public ; connecté, `me` situe le lecteur.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const period = params.get("period") ?? "month";
  const scope = params.get("scope") ?? "players";
  if (!isLeaderboardPeriod(period) || !isLeaderboardScope(scope)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  return NextResponse.json(
    await getLeaderboard(
      period,
      scope,
      session?.user ? new ObjectId(session.user.id) : undefined,
    ),
  );
}
