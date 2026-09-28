import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getBlueprintByName, isUserOwningBlueprint } from "@/lib/crafting";

/** Longer than any blueprint name, short enough to keep the regex cheap. */
const MAX_NAME_LENGTH = 200;

/**
 * GET /api/blueprints/lookup?name=<name>
 *
 * The blueprint a name designates, matched exactly (case and spacing aside).
 * The desktop app reads names from the game's `Game.log` and has to turn one
 * into an id before it can offer to add it: `?query=` on the list is a search,
 * and a search can answer with the wrong blueprint.
 *
 * Same shape as `GET /api/blueprints/:slug` — `owned` only for an
 * authenticated caller, default blueprints owned by everyone.
 */
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";

  if (!name) {
    return NextResponse.json(
      { error: "`name` is required" },
      { status: 400 },
    );
  }

  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `\`name\` must be at most ${MAX_NAME_LENGTH} characters` },
      { status: 400 },
    );
  }

  const blueprint = await getBlueprintByName(name);

  if (!blueprint) {
    return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json(blueprint);
  }

  const owned =
    blueprint.isDefault === true ||
    (await isUserOwningBlueprint(session.user.id!, blueprint.id));

  return NextResponse.json({ ...blueprint, owned });
}
