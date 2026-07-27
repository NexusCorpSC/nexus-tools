import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { Organization } from "@/app/orgs/page";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/orgs
 * Returns the public organizations and, when authenticated, the ones the
 * current user belongs to (with their rank and editor flag).
 *
 * Query params: query, limit, page
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  const sp = request.nextUrl.searchParams;
  const query = (sp.get("query") ?? "").trim();
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(sp.get("limit") ?? String(DEFAULT_LIMIT), 10)),
  );
  const skip = (page - 1) * limit;

  const publicMatch: Record<string, unknown> = { public: true };
  if (query) {
    publicMatch.$or = [
      { name: { $regex: query, $options: "i" } },
      { tag: { $regex: query, $options: "i" } },
    ];
  }

  const collection = db.db().collection<Organization>("organizations");

  const [total, publicOrgs] = await Promise.all([
    collection.countDocuments(publicMatch),
    collection
      .find(publicMatch)
      .project({ members: 0, joinCode: 0 })
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  const userOrgs = session?.user
    ? await collection
        .find({ "members.userId": new ObjectId(session.user.id) })
        .project({
          _id: 1,
          name: 1,
          tag: 1,
          description: 1,
          image: 1,
          public: 1,
          members: {
            $elemMatch: { userId: new ObjectId(session.user.id) },
          },
        })
        .toArray()
    : [];

  return NextResponse.json({
    organizations: publicOrgs.map((org) => ({
      id: org._id.toString(),
      name: org.name,
      tag: org.tag,
      description: org.description,
      image: org.image,
      public: org.public,
    })),
    userOrganizations: userOrgs.map((org) => {
      const membership = org.members?.[0];
      return {
        id: org._id.toString(),
        name: org.name,
        tag: org.tag,
        description: org.description,
        image: org.image,
        public: org.public,
        rank: membership?.rank ?? null,
        editor: membership?.editor === true,
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
