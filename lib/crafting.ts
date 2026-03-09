import "server-only";
import db from "./db";
import { Blueprint, UserBlueprint } from "@/types/crafting";

export async function searchBlueprints(query: string): Promise<Blueprint[]> {
  const collection = db.db().collection<Blueprint>("blueprints");
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

export async function getUsersWithBlueprintInOrganization(
  organizationId: string,
  blueprintId: string,
): Promise<string[]> {
  const collection = db.db().collection<UserBlueprint>("user-blueprints");

  const users = await collection
    .aggregate<{ userId: string }>([
      { $match: { blueprintId } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      { $match: { "user.organizationId": organizationId } },
      { $project: { _id: 0, userId: 1 } },
    ])
    .toArray();

  return users.map((u) => u.userId);
}
