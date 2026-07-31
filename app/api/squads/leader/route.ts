import { NextRequest, NextResponse } from "next/server";
import { transferLeadership } from "@/lib/squads";
import { readBody, resolveCommand } from "../caller";

/**
 * PATCH /api/squads/leader
 * Hands the squad to another member.
 *
 * Body: `{ userId }` — someone already in the squad. There is no way to name an
 * outsider: the squad comes from the session and the target is checked against
 * its own roster.
 *
 * **Whoever commands the squad may hand it over**, lieutenants included. That is
 * what «the same powers as the leader» means, and it is worth being plain about
 * the consequence: a lieutenant can take the squad from the leader who appointed
 * them. Appointing one is trusting them with the squad, not lending them a
 * button.
 *
 * The outgoing leader becomes a lieutenant rather than an ordinary member — see
 * `transferLeadership`.
 */
export async function PATCH(request: NextRequest) {
  const outcome = await resolveCommand();
  if ("refused" in outcome) return outcome.refused;

  const { squad, commands } = outcome;

  if (!commands) {
    return NextResponse.json(
      {
        error: "Only the squad leader or a lieutenant may hand the squad over",
      },
      { status: 403 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const userId = (parsed.body as { userId?: unknown } | null)?.userId;

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json(
      { error: "`userId` must be a non-empty string" },
      { status: 400 },
    );
  }

  // Already in charge: nothing to do, and answering the squad rather than an
  // error keeps a double click from looking like a failure.
  if (userId === squad.leaderId) {
    return NextResponse.json({ squad });
  }

  if (!squad.members.some((member) => member.userId === userId)) {
    return NextResponse.json(
      { error: "No such member in this squad" },
      { status: 404 },
    );
  }

  const updated = await transferLeadership(squad.id, squad.leaderId, userId);

  if (!updated) {
    // The write is guarded on both the target still being a member and the
    // leader still being the one we read. Either the target walked out, or
    // another commander handed the squad over first — both are «try again with
    // what the squad looks like now», not a server fault.
    return NextResponse.json(
      { error: "The squad changed hands; try again" },
      { status: 409 },
    );
  }

  return NextResponse.json({ squad: updated });
}
