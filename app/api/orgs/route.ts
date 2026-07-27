import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import type { Organization } from "@/app/orgs/page";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Parses a positive integer query param, falling back when absent or invalid. */
function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Escapes regex metacharacters so a search term is matched literally.
 * This endpoint is publicly reachable, so an unescaped `$regex` would let a
 * caller change the matching semantics or send a pathological pattern.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  const page = parsePositiveInt(sp.get("page"), 1);
  const limit = Math.min(
    MAX_LIMIT,
    parsePositiveInt(sp.get("limit"), DEFAULT_LIMIT),
  );
  const skip = (page - 1) * limit;

  const publicMatch: Record<string, unknown> = { public: true };
  if (query) {
    const pattern = escapeRegex(query);
    publicMatch.$or = [
      { name: { $regex: pattern, $options: "i" } },
      { tag: { $regex: pattern, $options: "i" } },
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
