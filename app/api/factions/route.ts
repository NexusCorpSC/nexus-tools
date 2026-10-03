import { NextResponse } from "next/server";
import db from "@/lib/db";
import { ACTIVE_MISSION } from "@/lib/data/missions";

export async function GET() {
  const factionsWithBlueprints = await db
    .db()
    .collection("factions")
    .aggregate([
      {
        $lookup: {
          from: "missions",
          localField: "_id",
          foreignField: "factionId",
          pipeline: [{ $match: ACTIVE_MISSION }],
          as: "missions",
        },
      },
      {
        $unwind: "$missions",
      },
      {
        $unwind: "$missions.blueprints",
      },
      {
        $lookup: {
          from: "blueprints",
          localField: "missions.blueprints",
          foreignField: "_id",
          as: "blueprintDetails",
        },
      },
      {
        $unwind: "$blueprintDetails",
      },
      {
        $group: {
          _id: "$_id",
          name: { $first: "$name" },
          blueprints: {
            $addToSet: {
              _id: "$blueprintDetails._id",
              name: "$blueprintDetails.name",
              slug: "$blueprintDetails.slug",
              category: "$blueprintDetails.category",
              subcategory: "$blueprintDetails.subcategory",
            },
          },
        },
      },
    ])
    .toArray();

  return NextResponse.json(factionsWithBlueprints);
}
