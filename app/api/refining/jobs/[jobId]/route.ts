import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { checkJobInput } from "@/lib/refining";
import { deleteRefiningJob, updateRefiningJob } from "@/lib/refining-jobs";
import { refiningErrorResponse } from "../errors";

type Params = { params: Promise<{ jobId: string }> };

/**
 * PUT /api/refining/jobs/:jobId
 * Même corps que la création ; le départ ne bouge pas. Répond `{ job }`.
 */
export async function PUT(request: NextRequest, { params }: Params) {
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
  const checked = checkJobInput(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  try {
    const job = await updateRefiningJob(session.user.id, jobId, checked.value);
    return NextResponse.json({ job });
  } catch (error) {
    return refiningErrorResponse(error);
  }
}

/** DELETE /api/refining/jobs/:jobId */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { jobId } = await params;

  try {
    await deleteRefiningJob(session.user.id, jobId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return refiningErrorResponse(error);
  }
}
