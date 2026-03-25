import "server-only";
import db from "./db";
import { Blueprint, UserBlueprint } from "@/types/crafting";
import { ObjectId, Document } from "bson";
import { Organization } from "@/app/orgs/page";

export async function searchBlueprints(
  query: string,
  { userId, fuzzy }: { userId?: string; fuzzy?: boolean } = {},
): Promise<(Blueprint & { owned?: boolean })[]> {
  const collection = db.db().collection<Blueprint>("blueprints");

  console.log("Searching blueprints with query:", query, "fuzzy:", fuzzy);

  if (fuzzy) {
    const results = await collection
      .aggregate([
        {
          $search: {
            index: "default",
            text: {
              query,
              path: "name",
              fuzzy: {
                maxEdits: 2,
                prefixLength: 3,
              },
            },
          },
        },
      ])
      .limit(3)
      .toArray();

    return results.map((bp) => ({
      id: bp._id.toString(),
      name: bp.name,
      slug: bp.slug,
      description: bp.description,
      category: bp.category,
      subcategory: bp.subcategory,
      imageUrl: bp.imageUrl,
    }));
  }

  if (userId) {
    const results = await collection
      .aggregate([
        {
          $match: {
            name: { $regex: query, $options: "i" },
          },
        },
        {
          $lookup: {
            from: "user-blueprints",
            let: { blueprintId: { $toString: "$_id" } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$blueprintId", "$$blueprintId"] },
                      { $eq: ["$userId", userId] },
                    ],
                  },
                },
              },
            ],
            as: "ownership",
          },
        },
        {
          $addFields: {
            owned: { $gt: [{ $size: "$ownership" }, 0] },
          },
        },
      ])
      .limit(10)
      .toArray();

    return results.map((bp) => ({
      id: bp._id.toString(),
      name: bp.name,
      slug: bp.slug,
      description: bp.description,
      category: bp.category,
      subcategory: bp.subcategory,
      owned: bp.owned,
      imageUrl: bp.imageUrl,
    }));
  } else {
    const results = await collection
      .find({
        name: { $regex: query, $options: "i" },
      })
      .limit(10)
      .toArray();

    return results.map((bp) => ({
      id: bp._id.toString(),
      name: bp.name,
      slug: bp.slug,
      description: bp.description,
      category: bp.category,
      subcategory: bp.subcategory,
      imageUrl: bp.imageUrl,
    }));
  }
}

export async function filterBlueprints(
  options: {
    query?: string;
    category?: string;
    subcategory?: string;
    /** undefined = tous, true = possédés seulement, false = non-possédés seulement */
    owned?: boolean;
    /** Noms de composants que la recette doit contenir (tous) */
    materials?: string[];
    userId?: string;
    limit?: number;
  } = {},
): Promise<(Blueprint & { owned?: boolean })[]> {
  const {
    query,
    category,
    subcategory,
    owned,
    materials,
    userId,
    limit = 64,
  } = options;

  const collection = db.db().collection<Blueprint>("blueprints");

  const matchConditions: Record<string, unknown>[] = [];

  if (query?.trim()) {
    matchConditions.push({ name: { $regex: query.trim(), $options: "i" } });
  }
  if (category) {
    matchConditions.push({ category });
  }
  if (subcategory) {
    matchConditions.push({ subcategory });
  }
  if (materials && materials.length > 0) {
    for (const material of materials) {
      matchConditions.push({
        "recipe.components": { $elemMatch: { name: material } },
      });
    }
  }

  const matchStage =
    matchConditions.length > 0 ? { $and: matchConditions } : {};

  if (userId) {
    const pipeline: Document[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: "user-blueprints",
          let: { blueprintId: { $toString: "$_id" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$blueprintId", "$$blueprintId"] },
                    { $eq: ["$userId", userId] },
                  ],
                },
              },
            },
          ],
          as: "ownership",
        },
      },
      {
        $addFields: {
          owned: { $gt: [{ $size: "$ownership" }, 0] },
        },
      },
    ];

    if (owned === true) {
      pipeline.push({ $match: { owned: true } });
    } else if (owned === false) {
      pipeline.push({ $match: { owned: false } });
    }

    pipeline.push({ $sort: { name: 1 } });
    pipeline.push({ $limit: limit });

    const results = await collection.aggregate(pipeline).toArray();

    return results.map((bp) => ({
      id: bp._id.toString(),
      name: bp.name,
      slug: bp.slug,
      description: bp.description,
      category: bp.category,
      subcategory: bp.subcategory,
      owned: (bp as unknown as { owned: boolean }).owned,
      imageUrl: bp.imageUrl,
      tier: bp.tier,
    }));
  } else {
    const results = await collection
      .find(matchStage as Parameters<typeof collection.find>[0])
      .sort({ name: 1 })
      .limit(limit)
      .toArray();

    return results.map((bp) => ({
      id: bp._id.toString(),
      name: bp.name,
      slug: bp.slug,
      description: bp.description,
      category: bp.category,
      subcategory: bp.subcategory,
      imageUrl: bp.imageUrl,
      tier: bp.tier,
    }));
  }
}

export async function getBlueprintById(id: string): Promise<Blueprint | null> {
  const collection = db.db().collection<Blueprint>("blueprints");
  const blueprint = await collection.findOne({ id });
  return blueprint;
}

export async function getBlueprintBySlug(
  slug: string,
): Promise<Blueprint | null> {
  const collection = db.db().collection<Blueprint>("blueprints");
  const blueprint = await collection.findOne({ slug });
  return blueprint
    ? {
        id: blueprint._id.toString(),
        name: blueprint.name,
        slug: blueprint.slug,
        description: blueprint.description,
        category: blueprint.category,
        subcategory: blueprint.subcategory,
        imageUrl: blueprint.imageUrl,
        tier: blueprint.tier ?? 0,
        craftingTime: blueprint.craftingTime,
        statistics: blueprint.statistics,
        recipe: blueprint.recipe,
        obtention: blueprint.obtention,
      }
    : null;
}

export async function getUserBlueprints(
  userId: string,
): Promise<(Blueprint & { addedAt: string })[]> {
  const collection = db.db().collection<UserBlueprint>("user-blueprints");

  const userBlueprints = await collection
    .aggregate<Blueprint & { addedAt: string }>([
      { $match: { userId } },
      {
        $lookup: {
          from: "blueprints",
          localField: "blueprintId",
          foreignField: "id",
          as: "blueprint",
        },
      },
      { $unwind: "$blueprint" },
      {
        $project: {
          _id: 0,
          id: "$blueprint.id",
          name: "$blueprint.name",
          description: "$blueprint.description",
          category: "$blueprint.category",
          subcategory: "$blueprint.subcategory",
          slug: "$blueprint.slug",
          imageUrl: "$blueprint.imageUrl",
          tier: "$blueprint.tier",
          craftingTime: "$blueprint.craftingTime",
          statistics: "$blueprint.statistics",
          recipe: "$blueprint.recipe",
          addedAt: 1,
        },
      },
    ])
    .toArray();

  return userBlueprints;
}

export async function isUserOwningBlueprint(
  userId: string,
  blueprintId: string,
): Promise<boolean> {
  const collection = db.db().collection<UserBlueprint>("user-blueprints");
  const entry = await collection.findOne({ userId, blueprintId });
  return entry !== null;
}

export async function addBlueprintToUser(
  userId: string,
  blueprintId: string,
): Promise<void> {
  const collection = db.db().collection<UserBlueprint>("user-blueprints");
  await collection.insertOne({
    userId,
    blueprintId,
    addedAt: new Date().toISOString(),
  });
}

export async function removeBlueprintFromUser(
  userId: string,
  blueprintId: string,
): Promise<void> {
  const collection = db.db().collection<UserBlueprint>("user-blueprints");
  await collection.deleteOne({ userId, blueprintId });
}

export async function deleteBlueprint(blueprintId: string): Promise<void> {
  await db.db().collection("user-blueprints").deleteMany({ blueprintId });
  await db
    .db()
    .collection<Blueprint>("blueprints")
    .deleteOne({ _id: new ObjectId(blueprintId) } as never);
}

export async function updateBlueprint(
  blueprintId: string,
  data: Partial<
    Pick<
      Blueprint,
      | "name"
      | "description"
      | "category"
      | "subcategory"
      | "slug"
      | "imageUrl"
      | "tier"
      | "craftingTime"
      | "statistics"
      | "recipe"
      | "obtention"
    >
  >,
): Promise<void> {
  await db
    .db()
    .collection<Blueprint>("blueprints")
    .updateOne({ _id: new ObjectId(blueprintId) } as never, { $set: data });
}

export async function getBlueprintStatNames(query: string): Promise<string[]> {
  const collection = db.db().collection<Blueprint>("blueprints");
  const results = await collection
    .aggregate<{ names: string[] }>([
      { $match: { statistics: { $exists: true, $ne: null } } },
      {
        $project: {
          names: { $objectToArray: "$statistics" },
        },
      },
      { $unwind: "$names" },
      {
        $group: {
          _id: "$names.k",
        },
      },
      {
        $match: {
          _id: { $regex: query, $options: "i" },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 20 },
    ])
    .toArray();
  return results.map((r) => (r as unknown as { _id: string })._id);
}

export async function getBlueprintComponentNames(
  query: string,
): Promise<string[]> {
  const collection = db.db().collection<Blueprint>("blueprints");
  const results = await collection
    .aggregate<{ _id: string }>([
      { $match: { "recipe.components": { $exists: true, $ne: null } } },
      { $unwind: "$recipe.components" },
      { $unwind: "$recipe.components.options" },
      {
        $group: {
          _id: "$recipe.components.options.name",
        },
      },
      {
        $match: {
          _id: { $regex: query, $options: "i" },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 20 },
    ])
    .toArray();
  return results.map((r) => r._id);
}

export async function getBlueprintCategories(): Promise<
  { category: string; subcategories: string[] }[]
> {
  const collection = db.db().collection<Blueprint>("blueprints");
  const results = await collection
    .aggregate<{ _id: string; subcategories: string[] }>([
      {
        $group: {
          _id: "$category",
          subcategories: { $addToSet: "$subcategory" },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return results.map((r) => ({
    category: r._id,
    subcategories: r.subcategories.filter((s): s is string => !!s).sort(),
  }));
}

export async function createBlueprint(
  data: Pick<Blueprint, "name" | "description" | "category" | "slug"> & {
    subcategory?: string;
    imageUrl?: string;
    tier?: number;
    craftingTime?: number;
    statistics?: Blueprint["statistics"];
    recipe?: Blueprint["recipe"];
  },
): Promise<string> {
  const { nanoid } = await import("nanoid");
  const id = nanoid();
  await db
    .db()
    .collection("blueprints")
    .insertOne({ ...data, id, tier: data.tier ?? 0 });
  return data.slug;
}

export type BlueprintOrgMember = {
  userId: string;
  name: string;
  avatar: string;
};

export async function getUsersWithBlueprintInOrganization(
  organizationId: string,
  blueprintId: string,
): Promise<BlueprintOrgMember[]> {
  // Retrieve member userIds from the organization
  const orgsCollection = db.db().collection<Organization>("organizations");
  const org = await orgsCollection.findOne<{
    members: { userId: ObjectId }[];
  }>({ _id: organizationId }, { projection: { members: 1 } });

  if (!org) return [];

  const memberUserIds = org.members.map((m: { userId: ObjectId }) =>
    m.userId.toString(),
  );

  // Among those members, find who owns the blueprint
  const ubCollection = db.db().collection<UserBlueprint>("user-blueprints");
  const owners = await ubCollection
    .aggregate<BlueprintOrgMember>([
      { $match: { blueprintId, userId: { $in: memberUserIds } } },
      {
        $addFields: { userObjectId: { $toObjectId: "$userId" } },
      },
      {
        $lookup: {
          from: "users",
          localField: "userObjectId",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { name: 1, avatar: 1 } }],
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          userId: 1,
          name: "$user.name",
          avatar: "$user.avatar",
        },
      },
    ])
    .toArray();

  return owners;
}
