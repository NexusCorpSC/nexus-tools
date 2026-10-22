import "server-only";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";

export async function requireAdmin() {
  if (await isAdmin()) {
    return;
  }

  throw new Error("Unauthorized");
}

export async function isAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return false;
  }

  const user = await db
    .db()
    .collection("users")
    .findOne(
      { _id: new ObjectId(session?.user?.id) },
      {
        projection: { isAdmin: 1 },
      },
    );

  return user?.isAdmin === true;
}

export async function requirePermission(permission: string) {
  if (await hasPermission(permission)) {
    return;
  }

  throw new Error("Unauthorized");
}

export async function hasPermission(permission: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return false;
  }

  return userHasPermission(session.user.id, permission);
}

/**
 * La même règle pour un joueur désigné par son identifiant : le serveur MCP
 * agit au nom du jeton, sans session.
 */
export async function userHasPermission(userId: string, permission: string) {
  if (!ObjectId.isValid(userId)) {
    return false;
  }

  const user = await db
    .db()
    .collection("users")
    .findOne(
      {
        _id: new ObjectId(userId),
        $or: [{ isAdmin: true }, { permissions: permission }],
      },
      {
        projection: { isAdmin: 1 },
      },
    );

  return !!user;
}
