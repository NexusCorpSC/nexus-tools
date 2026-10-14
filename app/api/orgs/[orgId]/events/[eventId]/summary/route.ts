import { NextResponse } from "next/server";
import { getOrgEventSummary } from "@/lib/org-events";
import {
  refusal,
  resolveAuthor,
  eventParams,
  type EventParams,
} from "../../caller";

/**
 * GET /api/orgs/:orgId/events/:eventId/summary
 * What the organizer reads: active registrations with their answers, counts by
 * role, and the withdrawn ones apart, counted nowhere. The event's creator and
 * the organization's editors only.
 */
export async function GET(_request: Request, context: EventParams) {
  const caller = await resolveAuthor();
  if ("refused" in caller) return caller.refused;

  const { orgId, eventId } = await eventParams(context);
  const outcome = await getOrgEventSummary(
    orgId,
    eventId,
    caller.author.userId,
  );
  if ("refusal" in outcome) return refusal(outcome.refusal);

  return NextResponse.json(outcome.summary);
}
