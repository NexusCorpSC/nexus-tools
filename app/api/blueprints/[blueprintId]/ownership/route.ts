import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { addBlueprintToUser } from "@/lib/crafting";

/**
 * POST /api/blueprints/[blueprintId]/ownership
 * Adds the blueprint to the authenticated user's own blueprints.
 *
 * Mirrors `addBlueprintAction`, which the site's own buttons call, so API
 * clients (desktop app) can do the same thing.
 *
 * Idempotent, and says which of the two happened: `added: false` means the
 * blueprint was already there. A client can word its feedback from that alone,
 * without asking a second question — which matters for the desktop search
 * palette, where the result carries no ownership of its own.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ blueprintId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { blueprintId } = await params;

  if (!ObjectId.isValid(blueprintId)) {
    return NextResponse.json(
      { error: "`blueprintId` is not a valid id" },
      { status: 400 },
    );
  }

  // Read before writing: `user-blueprints` holds ids and nothing else, so an
  // id that matches no blueprint would sit there unnoticed for good.
  const blueprint = await db
    .db()
    .collection("blueprints")
    .findOne({ _id: new ObjectId(blueprintId) }, { projection: { slug: 1 } });

  if (!blueprint) {
    return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
  }

  const added = await addBlueprintToUser(session.user.id!, blueprintId);

  // The site renders possession server-side, so an add made from elsewhere has
  // to drop the pages the user will come back to.
  if (added) {
    revalidatePath(`/crafting/blueprints/${blueprint.slug}`);
    revalidatePath("/crafting/blueprints");
  }

  return NextResponse.json({ owned: true, added });
}
