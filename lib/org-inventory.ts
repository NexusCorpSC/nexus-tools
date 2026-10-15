import "server-only";
import type { ObjectId } from "bson";
import db from "@/lib/db";

/**
 * L'inventaire partagé d'une organisation : les lots que ses membres rendent
 * visibles (`orgVisible`), avec leur lieu et le nom de qui les détient. Lu par
 * `GET /api/orgs/:orgId/inventory` et l'outil MCP `org_inventory` ; le
 * contrôle d'accès reste à l'appelant.
 */

/**
 * `all=1` : tout d'un coup, pour regrouper par lieu et par ressource côté
 * client — une page de 20 couperait un groupe en deux. Borné quand même.
 */
export const ORG_INVENTORY_ALL_LIMIT = 5000;

export interface OrgInventoryQuery {
  /** Partie du nom de l'objet (expression régulière, insensible à la casse). */
  query?: string;
  /** Qualité minimale, en texte comme dans l'adresse. */
  quality?: string;
  /** Un seul membre ; ignoré s'il n'est pas de l'organisation. */
  userId?: string;
  skip: number;
  limit: number;
}

export interface OrgInventoryLot {
  id: string;
  name: unknown;
  description: unknown;
  quality: unknown;
  quantity: unknown;
  unit: unknown;
  locationId: unknown;
  userId: unknown;
  orgVisible: true;
  updatedAt: unknown;
  ownerName: unknown;
  location: {
    id: string;
    name: unknown;
    slug: unknown;
    system: unknown;
    userId: unknown;
  } | null;
}

export async function listOrgInventory(
  members: { userId: ObjectId | string }[],
  { query = "", quality = "", userId = "", skip, limit }: OrgInventoryQuery,
): Promise<{
  total: number;
  items: OrgInventoryLot[];
  members: { id: string; name: string }[];
}> {
  // Member userIds
  const memberUserIds = members.map((m) => m.userId.toString());

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
        ownerName: {
          $ifNull: [{ $arrayElemAt: ["$userData.name", 0] }, "$userId"],
        },
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
                  {
                    $match: {
                      $expr: { $eq: [{ $toString: "$_id" }, "$$uid"] },
                    },
                  },
                  { $project: { name: 1 } },
                  { $limit: 1 },
                ],
                as: "userData",
              },
            },
            {
              $addFields: {
                name: {
                  $ifNull: [{ $arrayElemAt: ["$userData.name", 0] }, "$_id"],
                },
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
  const memberList: { id: string; name: string }[] = (
    result?.members ?? []
  ).map((m: Record<string, unknown>) => ({
    id: m._id as string,
    name: m.name as string,
  }));

  const items: OrgInventoryLot[] = rawItems.map(
    (item: Record<string, unknown>) => ({
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
            id: (
              (item.location as Record<string, unknown>)._id as ObjectId
            ).toString(),
            name: (item.location as Record<string, unknown>).name,
            slug: (item.location as Record<string, unknown>).slug,
            system: (item.location as Record<string, unknown>).system,
            userId: (item.location as Record<string, unknown>).userId,
          }
        : null,
    }),
  );

  return { total, items, members: memberList };
}
