import { NextRequest, NextResponse } from "next/server";
import { registerToOrgEvent, withdrawFromOrgEvent } from "@/lib/org-events";
import {
  readJson,
  refusal,
  resolveAuthor,
  eventParams,
  type EventParams,
} from "../../caller";

/**
 * PUT /api/orgs/:orgId/events/:eventId/registration
 * Registers the caller, or updates their registration — a withdrawn one comes
 * back active. Members of the organization only, until the event ends.
 *
 * Body: `{ role?, answers? }`. `role` is required when the event offers roles;
 * `answers` is keyed by question id, and required questions must be answered.
 */
export async function PUT(request: NextRequest, context: EventParams) {
  const caller = await resolveAuthor();
  if ("refused" in caller) return caller.refused;

  const { orgId, eventId } = await eventParams(context);
  const outcome = await registerToOrgEvent(
    orgId,
    eventId,
    caller.author,
    await readJson(request),
  );

  if ("invalid" in outcome) {
    return NextResponse.json({ error: outcome.invalid }, { status: 400 });
  }
  if ("refusal" in outcome) return refusal(outcome.refusal);

  return NextResponse.json(outcome.view);
}

/**
 * DELETE /api/orgs/:orgId/events/:eventId/registration
 * Withdraws the caller. Their answers are kept but no longer counted.
 * Idempotent; responds with the event as the caller now sees it. Closed once
 * the event is over, like registering.
 */
export async function DELETE(_request: Request, context: EventParams) {
  const caller = await resolveAuthor();
  if ("refused" in caller) return caller.refused;

  const { orgId, eventId } = await eventParams(context);
  const outcome = await withdrawFromOrgEvent(
    orgId,
    eventId,
    caller.author.userId,
  );
  if ("refusal" in outcome) return refusal(outcome.refusal);

  return NextResponse.json(outcome.view);
}
