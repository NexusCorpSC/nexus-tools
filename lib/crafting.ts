import "server-only";
import db from "./db";
import { Blueprint, UserBlueprint } from "@/types/crafting";
import { ObjectId } from "bson";
import { Organization } from "@/app/orgs/page";

export async function searchBlueprints(
  query: string,
  { userId, fuzzy }: { userId?: string; fuzzy?: boolean } = {},
): Promise<(Blueprint & { owned?: boolean })[]> {
  const collection = db.db().collection<Blueprint>("blueprints");

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
      "name" | "description" | "category" | "subcategory" | "slug"
    >
  >,
): Promise<void> {
  await db
    .db()
    .collection<Blueprint>("blueprints")
    .updateOne({ _id: new ObjectId(blueprintId) } as never, { $set: data });
}

export async function createBlueprint(
  data: Pick<Blueprint, "name" | "description" | "category" | "slug"> & {
    subcategory?: string;
  },
): Promise<string> {
  const { nanoid } = await import("nanoid");
  const id = nanoid();
  await db
    .db()
    .collection("blueprints")
    .insertOne({ ...data, id });
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
