import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { listOpenReports } from "@/lib/reports";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";

/**
 * GET /api/admin/reports
 * Les dossiers ouverts, les plus lourds d'abord : `{ items, total }`.
 * Réservé aux admins et à la permission `contributions:review`.
 */
export async function GET() {
  if (!(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  return NextResponse.json(await listOpenReports());
}
