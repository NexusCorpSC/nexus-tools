import { NextResponse, NextRequest } from "next/server";
import db from "@/lib/db";
import { ObjectId } from "bson";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query") || "";
  const factionId = searchParams.get("factionId") || undefined;
  const hasBlueprints = searchParams.get("hasBlueprints");
  const limitParam = searchParams.get("limit");
  const pageParam = searchParams.get("page");
  const limit = limitParam
    ? Math.max(1, Math.min(100, parseInt(limitParam, 10)))
    : 24;
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
  const skip = (page - 1) * limit;

  // Build MongoDB match stage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match: Record<string, any> = {};
  if (query) {
    match["$or"] = [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
    ];
  }
  if (factionId) {
    try {
      match["factionId"] = new ObjectId(factionId);
    } catch {
      return NextResponse.json({
        missions: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
    }
  }
  if (hasBlueprints === "true") {
    match["blueprints"] = { $exists: true, $not: { $size: 0 } };
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: "factions",
        localField: "factionId",
        foreignField: "_id",
        as: "faction",
        pipeline: [
          {
            $addFields: {
              _id: { $toString: "$_id" },
            },
          },
        ],
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
    {
      $addFields: {
        _id: { $toString: "$_id" },
      },
    },
    { $sort: { title: 1 } },
  ];

  const [total, missions] = await Promise.all([
    db.db().collection("missions").countDocuments(match),
    db
      .db()
      .collection("missions")
      .aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            category: 1,
            missionType: 1,
            title: 1,
            description: 1,
            canBeShared: 1,
            illegal: 1,
            rewardUEC: 1,
            faction: { _id: 1, name: 1 },
            blueprintDetails: {
              _id: 1,
              name: 1,
              slug: 1,
              category: 1,
              subcategory: 1,
              imageUrl: 1,
            },
          },
        },
      ])
      .toArray(),
  ]);

  return NextResponse.json({
    missions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
