import { NextResponse, NextRequest } from "next/server";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { missionBlueprintsLookup } from "@/lib/missions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const { missionId } = await params;

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(missionId);
  } catch {
    return NextResponse.json({ error: "Invalid mission ID" }, { status: 400 });
  }

  // L'app envoie le cookie de session : chaque blueprint porte
  // alors `owned`, comme sur la fiche du site.
  const session = await auth.api.getSession({ headers: await headers() });

  const [mission] = await db
    .db()
    .collection("missions")
    .aggregate([
      { $match: { _id: objectId } },
      {
        $lookup: {
          from: "factions",
          localField: "factionId",
          foreignField: "_id",
          as: "faction",
        },
      },
      { $unwind: { path: "$faction", preserveNullAndEmptyArrays: true } },
      missionBlueprintsLookup(session?.user?.id),
    ])
    .toArray();

  if (!mission) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }

  return NextResponse.json(mission);
}

