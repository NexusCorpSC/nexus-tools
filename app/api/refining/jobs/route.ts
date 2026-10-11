import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { checkJobInput } from "@/lib/refining";
import { createRefiningJob, listRefiningJobs } from "@/lib/refining-jobs";
import { refiningErrorResponse } from "./errors";

/**
 * GET /api/refining/jobs
 * Les ordres de raffinage du joueur, les prêts d'abord puis par fin la plus
 * proche. Chaque ordre porte son `endTime` : l'app compte à rebours et
 * notifie la fin d'elle-même.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ jobs: await listRefiningJobs(session.user.id) });
}

/**
 * POST /api/refining/jobs
 * Body : `{ locationId, method?, lines: [{ name, quality?, quantity }],
 * cost?, note?, duration }`, la quantité en cSCU et la durée en minutes.
 * L'ordre commence maintenant ; répond `{ job }`.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const checked = checkJobInput(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  try {
    const job = await createRefiningJob(session.user.id, checked.value);
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    return refiningErrorResponse(error);
  }
}
