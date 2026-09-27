import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import {
  declarePlaying,
  getMyPresence,
  normalizeActivity,
  stopPlaying,
} from "@/lib/presence";
import { PRESENCE_ACTIVITY_MAX_LENGTH } from "@/types/presence";

/**
 * GET /api/me/presence
 * Whether the authenticated user declared they are playing, and doing what.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getMyPresence(new ObjectId(session.user.id)));
}

/**
 * PUT /api/me/presence
 * Declares playing, or renews the declaration — it lapses on its own after
 * `PRESENCE_TTL_HOURS`, so a client that stays open renews it (Nexus App does).
 *
 * Body: { activity?: string | null } — `null` or "" clears the activity; an
 * absent field keeps the current one.
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

  // Absent means «keep the current one»: a renewal need not repeat it.
  const sent = body !== null && typeof body === "object" && "activity" in body;
  const activity = sent
    ? normalizeActivity((body as { activity: unknown }).activity)
    : undefined;

  if (activity === false) {
    return NextResponse.json(
      {
        error: `\`activity\` must be a string of at most ${PRESENCE_ACTIVITY_MAX_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await declarePlaying(new ObjectId(session.user.id), activity),
  );
}

/**
 * DELETE /api/me/presence
 * Stops playing. Idempotent.
 */
export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await stopPlaying(new ObjectId(session.user.id)));
}
