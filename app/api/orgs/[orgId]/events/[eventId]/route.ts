import { NextRequest, NextResponse } from "next/server";
import {
  deleteOrgEvent,
  getOrgEventView,
  parseOrgEventInput,
  updateOrgEvent,
} from "@/lib/org-events";
import {
  readJson,
  readerId,
  refusal,
  resolveAuthor,
  eventParams,
  type EventParams,
} from "../caller";

/**
 * GET /api/orgs/:orgId/events/:eventId
 * The event, with what the reader can do with it. A public event reads without
 * an account; a private one answers 404 to anyone but members.
 */
export async function GET(_request: Request, context: EventParams) {
  const { orgId, eventId } = await eventParams(context);
  const view = await getOrgEventView(orgId, eventId, await readerId());

  if (!view) return refusal("not-found");

  return NextResponse.json(view);
}

/**
 * PUT /api/orgs/:orgId/events/:eventId
 * Replaces the event with the body, a whole `OrgEventInput`. Its creator and
 * the organization's editors only.
 *
 * Roles and questions keep their `id` when it is sent back; registrations
 * pointing at a removed one read as if it were unanswered.
 */
export async function PUT(request: NextRequest, context: EventParams) {
  const caller = await resolveAuthor();
  if ("refused" in caller) return caller.refused;

  const { orgId, eventId } = await eventParams(context);
  const parsed = parseOrgEventInput(await readJson(request));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const outcome = await updateOrgEvent(
    orgId,
    eventId,
    caller.author.userId,
    parsed.value,
  );
  if ("refusal" in outcome) return refusal(outcome.refusal);

  return NextResponse.json(outcome.view);
}

/**
 * DELETE /api/orgs/:orgId/events/:eventId
 * Its creator and the organization's editors only.
 */
export async function DELETE(_request: Request, context: EventParams) {
  const caller = await resolveAuthor();
  if ("refused" in caller) return caller.refused;

  const { orgId, eventId } = await eventParams(context);
  const outcome = await deleteOrgEvent(orgId, eventId, caller.author.userId);
  if ("refusal" in outcome) return refusal(outcome.refusal);

  return new NextResponse(null, { status: 204 });
}
