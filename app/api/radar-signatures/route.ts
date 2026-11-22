import { NextResponse } from "next/server";
import { getRadarSignatures } from "@/lib/radar-signatures";

/**
 * GET /api/radar-signatures
 * Les signatures radar connues (astéroïdes, minerais, épaves…), que le
 * scanner compare à la valeur lue. Publique : la même pour tous.
 *
 * L'app de bureau la lit et la garde dans son store, pour que le scanner
 * marche aussi hors connexion.
 */
export async function GET() {
  const signatures = await getRadarSignatures();

  return NextResponse.json({ signatures });
}
