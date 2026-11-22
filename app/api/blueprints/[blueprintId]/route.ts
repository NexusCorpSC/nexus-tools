import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getBlueprintBySlug, isUserOwningBlueprint } from "@/lib/crafting";
import { getWikeloTradesForBlueprint } from "@/lib/wikelo";

type Params = { params: Promise<{ blueprintId: string }> };

/**
 * GET /api/blueprints/:slug
 * Returns the full details of a blueprint (recipe, statistics, obtention),
 * with the Wikelo trades that give it (`wikeloTrades`).
 * The route segment is named `blueprintId` to stay consistent with the
 * sibling `org-owners` route, but the value is the blueprint slug.
 *
 * `owned` is only there for an authenticated caller — the same field the list
 * route computes, and what a client needs to tell «add this one» from «you
 * already have it». Default blueprints count as owned by everyone.
 */
export async function GET(_request: Request, { params }: Params) {
  const { blueprintId: slug } = await params;

  const blueprint = await getBlueprintBySlug(slug);

  if (!blueprint) {
    return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
  }

  // Les échanges de Wikelo qui donnent ce blueprint, comme sur la fiche.
  const [session, wikeloTrades] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getWikeloTradesForBlueprint(blueprint.slug),
  ]);

  if (!session?.user) {
    return NextResponse.json({ ...blueprint, wikeloTrades });
  }

  const owned =
    blueprint.isDefault === true ||
    (await isUserOwningBlueprint(session.user.id!, blueprint.id));

  return NextResponse.json({ ...blueprint, wikeloTrades, owned });
}
