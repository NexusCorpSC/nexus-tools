import { NextResponse } from "next/server";
import { getPlacePlans } from "@/lib/places";

/**
 * GET /api/lieux/<slug>/plans
 * Le strict nécessaire pour afficher le plan d'un lieu voisin : c'est ce que
 * le visualiseur demande quand on descend dans un lieu imbriqué, plutôt que
 * de recharger toute la fiche.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const plans = await getPlacePlans(slug);

  if (!plans) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  return NextResponse.json(plans);
}
