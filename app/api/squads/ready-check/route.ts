import { NextRequest, NextResponse } from "next/server";
import { requestSquadReadyCheck } from "@/lib/squads";
import { resolveCommand, squadResponse } from "../caller";

/**
 * POST /api/squads/ready-check?squad=<id>
 * «Everybody, say you are ready»: every member of the squad goes back to not
 * ready, and the squad is stamped with a fresh check that the event stream
 * carries to each of them — the overlay turns it into a notification with a
 * «Prêt» button, which is `PATCH /api/squads/members/:userId` on one's own row.
 *
 * **Whoever commands the squad** — the leader, or a lieutenant. The check
 * resets the asker too: they are a member like the others.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveCommand(request);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squad, commands } = outcome;

  if (!commands) {
    return NextResponse.json(
      { error: "Only the squad leader or a lieutenant may ask for a ready check" },
      { status: 403 },
    );
  }

  const updated = await requestSquadReadyCheck(squad.id, caller.name);

  if (!updated) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  return squadResponse(caller, updated);
}
