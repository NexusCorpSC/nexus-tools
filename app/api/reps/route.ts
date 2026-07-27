import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getFaction, getPlayerReputations } from "@/lib/reputations";

/**
 * GET /api/reps
 * Returns the reputations of the authenticated player.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reputations = await getPlayerReputations(session.user.id);

  return NextResponse.json({ reputations });
}

/**
 * PUT /api/reps
 * Updates the authenticated player's standing and/or career level for a
 * faction. Mirrors the server actions used by the /reps page so API clients
 * (desktop app) can edit reputations too.
 *
 * Body: { factionName, standing?, careerName?, levelName? }
 * `careerName` and `levelName` must be provided together.
 */
export async function PUT(request: NextRequest) {
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

  const { factionName, standing, careerName, levelName } = body as Record<
    string,
    unknown
  >;

  if (typeof factionName !== "string" || !factionName.trim()) {
    return NextResponse.json(
      { error: "factionName is required" },
      { status: 400 },
    );
  }

  const faction = await getFaction(factionName);
  if (!faction) {
    return NextResponse.json({ error: "Faction not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};

  if (standing !== undefined) {
    if (typeof standing !== "string" || !faction.standings?.includes(standing)) {
      return NextResponse.json({ error: "Invalid standing" }, { status: 400 });
    }
    update[`reputations.${factionName}.standing`] = standing;
  }

  if (careerName !== undefined || levelName !== undefined) {
    if (typeof careerName !== "string" || typeof levelName !== "string") {
      return NextResponse.json(
        { error: "careerName and levelName must be provided together" },
        { status: 400 },
      );
    }

    const career = faction.careers.find((c) => c.name === careerName);
    if (!career) {
      return NextResponse.json({ error: "Invalid career" }, { status: 400 });
    }

    const level = career.levels.find((l) => l.name === levelName);
    if (!level) {
      return NextResponse.json({ error: "Invalid level" }, { status: 400 });
    }

    update[`reputations.${factionName}.careers.${careerName}.level`] = level;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update: provide standing and/or careerName+levelName" },
      { status: 400 },
    );
  }

  await db
    .db()
    .collection("users")
    .updateOne({ _id: new ObjectId(session.user.id) }, { $set: update });

  const reputations = await getPlayerReputations(session.user.id);

  return NextResponse.json({ reputations });
}
