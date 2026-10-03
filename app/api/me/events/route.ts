import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listMyUpcomingEvents } from "@/lib/org-events";

/**
 * GET /api/me/events
 * The upcoming organization events the user is registered to, soonest first:
 * what a planned session can pick up.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    events: await listMyUpcomingEvents(session.user.id),
  });
}
