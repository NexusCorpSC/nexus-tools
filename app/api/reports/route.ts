import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { ReportError, submitReport } from "@/lib/reports";

/**
 * POST /api/reports
 * Body : `{ target: { type, id }, reason, comment? }`. `type` parmi `place`
 * (slug), `placeMedia` (identifiant de l'image), `plan` (`slug:planId`),
 * `item` (slug), `org` (identifiant). `comment` est obligatoire pour `other`.
 *
 * Répond `{ id, status, reporters }`. Refus : `{ error }` — voir
 * `ReportErrorCode` : `ownContent`, `alreadyReported`, `dailyLimit`,
 * `reportingSuspended`…
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await submitReport(
        { id: new ObjectId(session.user.id), name: session.user.name },
        body,
      ),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ReportError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
}
