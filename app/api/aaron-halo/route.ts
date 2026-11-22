import { NextResponse } from "next/server";
import { DEFAULT_HALO_BANDS, HALO_POINTS } from "@/lib/aaron-halo";

/**
 * GET /api/aaron-halo
 * Les bandes de l'Aaron Halo et les cibles de saut de Stanton, de quoi
 * calculer où couper un saut quantique (`lib/aaron-halo.ts`). Publique : la
 * même pour tous.
 *
 * L'app de bureau la lit et la garde dans son store : un relevé corrigé ici
 * lui parvient sans nouvelle version, et elle calcule hors connexion.
 */
export function GET() {
  return NextResponse.json({ bands: DEFAULT_HALO_BANDS, points: HALO_POINTS });
}
