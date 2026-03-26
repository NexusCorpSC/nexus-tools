import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { Organization } from "@/app/orgs/page";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type Params = { params: Promise<{ orgId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  // Fetch org and verify membership
  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const isMember = org.members.some((m) =>
    new ObjectId(m.userId).equals(session.user.id)
  );
  if (!isMember && !org.public) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse query params
  const sp = request.nextUrl.searchParams;
  const query = sp.get("query") ?? "";
  const quality = sp.get("quality") ?? "";
  const userId = sp.get("userId") ?? "";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(sp.get("limit") ?? String(DEFAULT_LIMIT), 10))
  );
  const skip = (page - 1) * limit;

  // Member userIds
  const memberUserIds = org.members.map((m) => m.userId.toString());

  // Build match stage
  const matchStage: Record<string, unknown> = {
    userId: { $in: memberUserIds },
    orgVisible: true,
  };
  if (query.trim()) {
    matchStage.name = { $regex: query.trim(), $options: "i" };
  }
  if (quality.trim()) {
    const minQuality = parseInt(quality, 10);
    if (!isNaN(minQuality)) {
      matchStage.quality = { $gte: minQuality };
    }
  }
  if (userId.trim() && memberUserIds.includes(userId.trim())) {
    matchStage.userId = userId.trim();
  }

  // Count + paginated items in a single aggregate using $facet
  const [result] = await db
    .db()
    .collection("inventoryItems")
    .aggregate([
      { $match: matchStage },
      {
        $facet: {
          total: [{ $count: "count" }],
          items: [
            { $sort: { updatedAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "locations",
                let: { locationId: "$locationId" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: [{ $toString: "$_id" }, "$$locationId"] },
                    },
                  },
                  { $limit: 1 },
                ],
                as: "locationData",
              },
            },
            {
              $addFields: {
                location: { $arrayElemAt: ["$locationData", 0] },
              },
            },
            { $unset: "locationData" },
          ],
        },
      },
    ])
    .toArray();

  const total: number = result?.total?.[0]?.count ?? 0;
  const rawItems = result?.items ?? [];

  // Fetch member names
  const memberObjectIds = org.members.map((m) => new ObjectId(m.userId));
  const users = await db
    .db()
    .collection("users")
    .find({ _id: { $in: memberObjectIds } })
    .project({ _id: 1, name: 1 })
    .toArray();

  const userNameMap = new Map<string, string>(
    users.map((u) => [u._id.toString(), u.name as string])
  );

  const items = rawItems.map((item: Record<string, unknown>) => ({
    id: (item._id as ObjectId).toString(),
    name: item.name,
    description: item.description,
    quality: item.quality,
    quantity: item.quantity,
    unit: item.unit,
    locationId: item.locationId,
    userId: item.userId,
    orgVisible: true,
    updatedAt: item.updatedAt,
    ownerName: userNameMap.get(item.userId as string) ?? (item.userId as string),
    location: item.location
      ? {
          id: ((item.location as Record<string, unknown>)._id as ObjectId).toString(),
          name: (item.location as Record<string, unknown>).name,
          slug: (item.location as Record<string, unknown>).slug,
          system: (item.location as Record<string, unknown>).system,
          userId: (item.location as Record<string, unknown>).userId,
        }
      : null,
  }));

  // Members list for the owner filter dropdown
  const members = users.map((u) => ({
    id: u._id.toString(),
    name: u.name as string,
  }));

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
    members,
  });
}
