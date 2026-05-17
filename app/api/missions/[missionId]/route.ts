import { NextResponse, NextRequest } from "next/server";
import db from "@/lib/db";
import { ObjectId } from "bson";

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
      {
        $lookup: {
          from: "blueprints",
          localField: "blueprints",
          foreignField: "_id",
          as: "blueprintDetails",
        },
      },
    ])
    .toArray();

  if (!mission) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 });
  }

  return NextResponse.json(mission);
}

