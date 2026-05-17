import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  const factions = await db
    .db()
    .collection("factions")
    .aggregate([
      {
        $lookup: {
          from: "missions",
          localField: "_id",
          foreignField: "factionId",
          as: "missions",
        },
      },
      {
        $addFields: {
          missionCount: { $size: "$missions" },
          blueprintIds: {
            $reduce: {
              input: "$missions.blueprints",
              initialValue: [],
              in: { $setUnion: ["$$value", "$$this"] },
            },
          },
        },
      },
      {
        $addFields: {
          blueprintCount: { $size: "$blueprintIds" },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          missionCount: 1,
          blueprintCount: 1,
        },
      },
      { $sort: { name: 1 } },
    ])
    .toArray();

  return NextResponse.json(factions);
}

