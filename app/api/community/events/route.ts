import { NextResponse } from "next/server";
import { readerId } from "@/app/api/orgs/[orgId]/events/caller";
import { listCommunityEvents } from "@/lib/org-events";

/**
 * GET /api/community/events
 * The community calendar, from a day ago to three months ahead, earliest
 * first: every organization's public events and, for a signed-in reader, all
 * the events of their own organizations. `myOrgs` lists those organizations,
 * with or without events, for the filters.
 *
 * (`/api/events` is the server-sent event stream, hence `community`.)
 */
export async function GET() {
  return NextResponse.json(await listCommunityEvents(await readerId()));
}
