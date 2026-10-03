import { NextResponse } from "next/server";
import { createSquadFromEvent } from "@/lib/org-events";
import { refusal, resolveAuthor } from "../../caller";

type Params = { params: Promise<{ orgId: string; eventId: string }> };

/**
 * POST /api/orgs/:orgId/events/:eventId/squad
 * Builds the event's squad: the caller leads it, every active registrant is in
 * it with the role they picked, and nobody leaves the squad they were in. Past
 * twenty, several squads under one raid.
 *
 * The event's creator and the organization's editors only. Once: 409 while the
 * squad exists; a squad since dissolved can be built again.
 *
 * Responds `{ event, squad: { id, name, code }, squadCount, leftOut }`.
 */
export async function POST(_request: Request, { params }: Params) {
  const caller = await resolveAuthor();
  if ("refused" in caller) return caller.refused;

  const { orgId, eventId } = await params;
  const outcome = await createSquadFromEvent(orgId, eventId, caller.author);

  if ("refusal" in outcome) {
    if (outcome.refusal === "already") {
      return NextResponse.json(
        { error: "The event's squad already exists" },
        { status: 409 },
      );
    }
    if (outcome.refusal === "empty") {
      return NextResponse.json(
        { error: "Nobody is registered to the event" },
        { status: 409 },
      );
    }
    return refusal(outcome.refusal);
  }

  return NextResponse.json(
    {
      event: outcome.view,
      squad: outcome.squad,
      squadCount: outcome.squadCount,
      leftOut: outcome.leftOut,
    },
    { status: 201 },
  );
}
