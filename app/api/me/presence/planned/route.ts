import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { cancelPlannedSession, planSession } from "@/lib/presence";

/**
 * PUT /api/me/presence/planned
 * Plans the next session, or replaces the planned one.
 *
 * Body: { at?: string, activity?: string | null, event?: { orgId, eventId } }.
 * With `event` — an upcoming event the user is registered to — `at` and
 * `activity` default to its start and title; without, `at` is required.
 *
 * The planned session shows until `PLANNED_SESSION_GRACE_HOURS` after `at`,
 * and is consumed when the user starts playing. Answers the whole presence,
 * as GET /api/me/presence does.
 */
export async function PUT(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const outcome = await planSession(new ObjectId(session.user.id), body);
  if ("error" in outcome) {
    return NextResponse.json(
      { error: outcome.error },
      { status: outcome.status },
    );
  }
  return NextResponse.json(outcome.presence);
}

/**
 * DELETE /api/me/presence/planned
 * Cancels the planned session. Idempotent.
 */
export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    await cancelPlannedSession(new ObjectId(session.user.id)),
  );
}
