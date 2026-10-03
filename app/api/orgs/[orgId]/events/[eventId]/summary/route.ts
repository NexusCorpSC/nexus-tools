import { NextResponse } from "next/server";
import { getOrgEventSummary } from "@/lib/org-events";
import { refusal, resolveAuthor } from "../../caller";

type Params = { params: Promise<{ orgId: string; eventId: string }> };

/**
 * GET /api/orgs/:orgId/events/:eventId/summary
 * What the organizer reads: active registrations with their answers, counts by
 * role, and the withdrawn ones apart, counted nowhere. The event's creator and
 * the organization's editors only.
 */
export async function GET(_request: Request, { params }: Params) {
  const caller = await resolveAuthor();
  if ("refused" in caller) return caller.refused;

  const { orgId, eventId } = await params;
  const outcome = await getOrgEventSummary(orgId, eventId, caller.author.userId);
  if ("refusal" in outcome) return refusal(outcome.refusal);

  return NextResponse.json(outcome.summary);
}
