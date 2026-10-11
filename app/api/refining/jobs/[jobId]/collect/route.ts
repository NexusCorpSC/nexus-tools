import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { checkCollectInput } from "@/lib/refining";
import { collectRefiningJob } from "@/lib/refining-jobs";
import { refiningErrorResponse } from "../../errors";

type Params = { params: Promise<{ jobId: string }> };

/**
 * POST /api/refining/jobs/:jobId/collect
 * Body : `{ lines: [{ name, quality?, quantity }], locationId, unit:
 * "cSCU" | "SCU", orgVisible }`, les quantités en cSCU. Ajoute les lignes à
 * l'inventaire (en complétant un lot identique) et supprime l'ordre ; sans
 * ligne, l'ordre est seulement retiré. Répond `{ created, merged }`.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { jobId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const checked = checkCollectInput(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  try {
    const result = await collectRefiningJob(
      session.user.id,
      jobId,
      checked.value,
    );
    return NextResponse.json(result);
  } catch (error) {
    return refiningErrorResponse(error);
  }
}
