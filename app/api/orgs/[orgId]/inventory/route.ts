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

  // Base match: all org-visible items, with optional name/quality filters
  const baseMatch: Record<string, unknown> = {
    userId: { $in: memberUserIds },
    orgVisible: true,
  };
  if (query.trim()) {
    baseMatch.name = { $regex: query.trim(), $options: "i" };
  }
  if (quality.trim()) {
    const minQuality = parseInt(quality, 10);
    if (!isNaN(minQuality)) {
      baseMatch.quality = { $gte: minQuality };
    }
  }

  // Optional per-member filter applied inside each facet branch
  const userIdFilter =
    userId.trim() && memberUserIds.includes(userId.trim())
      ? [{ $match: { userId: userId.trim() } }]
      : [];

  const userLookup = [
    {
      $lookup: {
        from: "users",
        let: { uid: "$userId" },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$uid"] } } },
          { $project: { name: 1 } },
          { $limit: 1 },
        ],
        as: "userData",
      },
    },
    {
      $addFields: {
        ownerName: { $ifNull: [{ $arrayElemAt: ["$userData.name", 0] }, "$userId"] },
      },
    },
    { $unset: "userData" },
  ];

  const locationLookup = [
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
    { $addFields: { location: { $arrayElemAt: ["$locationData", 0] } } },
    { $unset: "locationData" },
  ];

  // Single aggregate: total + paginated items (with lookups) + members list
  const [result] = await db
    .db()
    .collection("inventoryItems")
    .aggregate([
      { $match: baseMatch },
      {
        $facet: {
          total: [...userIdFilter, { $count: "count" }],
          items: [
            ...userIdFilter,
            { $sort: { updatedAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            ...locationLookup,
            ...userLookup,
          ],
          members: [
            { $group: { _id: "$userId" } },
            {
              $lookup: {
                from: "users",
                let: { uid: "$_id" },
                pipeline: [
                  { $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$uid"] } } },
                  { $project: { name: 1 } },
                  { $limit: 1 },
                ],
                as: "userData",
              },
            },
            {
              $addFields: {
                name: { $ifNull: [{ $arrayElemAt: ["$userData.name", 0] }, "$_id"] },
              },
            },
            { $project: { _id: 1, name: 1 } },
            { $sort: { name: 1 } },
          ],
        },
      },
    ])
    .toArray();

  const total: number = result?.total?.[0]?.count ?? 0;
  const rawItems = result?.items ?? [];
  const members: { id: string; name: string }[] = (result?.members ?? []).map(
    (m: Record<string, unknown>) => ({
      id: m._id as string,
      name: m.name as string,
    })
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
    ownerName: item.ownerName,
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

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
    members,
  });
}
