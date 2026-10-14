import { NextRequest, NextResponse } from "next/server";
import { createOrgEvent, parseOrgEventInput } from "@/lib/org-events";
import {
  readJson,
  refusal,
  resolveAuthor,
} from "@/app/api/orgs/[orgId]/events/caller";

/**
 * POST /api/personal-events
 * Plans a personal event, outside any organization: its creator alone manages
 * it, and it shows to the players they invite or give the share link to. Any
 * signed-in player, up to `PERSONAL_EVENT_MAX_UPCOMING` upcoming ones.
 *
 * Body: `OrgEventInput`; `visibility` is ignored, a personal event is always
 * private. Its other routes mirror `/api/orgs/:orgId/events/:eventId`.
 */
export async function POST(request: NextRequest) {
  const caller = await resolveAuthor();
  if ("refused" in caller) return caller.refused;

  const parsed = parseOrgEventInput(await readJson(request));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const outcome = await createOrgEvent(null, caller.author, parsed.value);
  if ("refusal" in outcome) return refusal(outcome.refusal);

  return NextResponse.json(outcome.view, { status: 201 });
}
