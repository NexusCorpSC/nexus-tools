import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { ContributionError } from "@/lib/contribution-store";
import { submitCatalogContribution } from "@/lib/contributions";

/**
 * POST /api/lieux/{slug}/position
 * Corps JSON : `{ position: { body?, x, y, z }, gameVersion? }`, en mètres,
 * déjà dans le repère du corps (voir `PlacePosition`).
 *
 * Pour le NPS de l'app : un joueur sur place relève sa position et la propose
 * pour le lieu. C'est une correction de fiche comme une autre (`placeEdit`),
 * publiée d'emblée au niveau 3, relue d'abord en dessous.
 *
 * Répond 201 `{ contribution, standing }`, ou `{ error }`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }
  if (!body.position || typeof body.position !== "object") {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }

  try {
    const result = await submitCatalogContribution(
      { id: new ObjectId(session.user.id), name: session.user.name },
      { kind: "placeEdit", slug, input: { position: body.position } },
      { source: "/showlocation", gameVersion: body.gameVersion },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ContributionError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
}
