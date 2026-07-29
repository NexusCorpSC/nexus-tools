import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { addBlueprintToUser, removeBlueprintFromUser } from "@/lib/crafting";

/**
 * Whether the authenticated user owns a given blueprint, as a REST resource.
 *
 * Mirrors `addBlueprintAction` / `removeBlueprintAction`, which the site's own
 * buttons call, so API clients (desktop app) can do the same thing.
 *
 * Both verbs are idempotent and say which of the two happened: `added` and
 * `removed` are false when the blueprint was already on the side asked for. A
 * client can word its feedback from that alone, without asking a second
 * question — which matters for the desktop search palette, where the result
 * carries no ownership of its own.
 */

type Resolved = {
  userId: string;
  blueprintId: string;
  slug: string;
  /** Owned by everyone, and therefore not something a user can drop. */
  isDefault: boolean;
};

/** The session, the id and the blueprint — or the answer to send instead. */
async function resolve(
  params: Promise<{ blueprintId: string }>,
): Promise<{ refused: NextResponse } | { resolved: Resolved }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return {
      refused: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { blueprintId } = await params;

  if (!ObjectId.isValid(blueprintId)) {
    return {
      refused: NextResponse.json(
        { error: "`blueprintId` is not a valid id" },
        { status: 400 },
      ),
    };
  }

  // Read the blueprint before touching anything: `user-blueprints` holds ids
  // and nothing else, so an id that matches nothing would sit there unnoticed.
  const blueprint = await db
    .db()
    .collection("blueprints")
    .findOne(
      { _id: new ObjectId(blueprintId) },
      { projection: { slug: 1, isDefault: 1 } },
    );

  if (!blueprint) {
    return {
      refused: NextResponse.json(
        { error: "Blueprint not found" },
        { status: 404 },
      ),
    };
  }

  return {
    resolved: {
      userId: session.user.id!,
      blueprintId,
      slug: blueprint.slug,
      isDefault: blueprint.isDefault === true,
    },
  };
}

/**
 * The site renders possession server-side, so a change made from elsewhere has
 * to drop the pages the user will come back to.
 */
function revalidate(slug: string): void {
  revalidatePath(`/crafting/blueprints/${slug}`);
  revalidatePath("/crafting/blueprints");
}

/** POST — adds the blueprint to the user's own. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ blueprintId: string }> },
) {
  const outcome = await resolve(params);
  if ("refused" in outcome) return outcome.refused;

  const { userId, blueprintId, slug, isDefault } = outcome.resolved;

  // A default blueprint is owned by everyone — that is what `owned` says
  // everywhere else. Recording it would write a row that changes nothing and
  // answer «added», which is not what happened.
  if (isDefault) {
    return NextResponse.json({ owned: true, added: false });
  }

  const added = await addBlueprintToUser(userId, blueprintId);

  if (added) revalidate(slug);

  return NextResponse.json({ owned: true, added });
}

/**
 * DELETE — drops the blueprint from the user's own.
 *
 * A default blueprint stays owned whatever happens, so `owned` is what the user
 * ends up with rather than an echo of the verb. Any row one of them picked up
 * before this route refused to write them is cleared on the way through.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ blueprintId: string }> },
) {
  const outcome = await resolve(params);
  if ("refused" in outcome) return outcome.refused;

  const { userId, blueprintId, slug, isDefault } = outcome.resolved;

  const removed = await removeBlueprintFromUser(userId, blueprintId);

  if (removed) revalidate(slug);

  return NextResponse.json({ owned: isDefault, removed });
}
