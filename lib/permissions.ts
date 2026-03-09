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

  const user = await db
    .db()
    .collection("users")
    .findOne(
      {
        _id: new ObjectId(session?.user?.id),
        $or: [{ isAdmin: true }, { permissions: permission }],
      },
      {
        projection: { isAdmin: 1 },
      },
    );

  return !!user;
}
