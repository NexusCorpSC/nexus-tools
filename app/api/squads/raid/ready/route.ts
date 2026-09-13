import { NextRequest, NextResponse } from "next/server";
import { markRaidMemberReady } from "@/lib/squads";
import { currentSquadView, requestedSquad, resolveRaid } from "../../caller";

/**
 * POST /api/squads/raid/ready?squad=<id>
 * «Je suis prêt», answered to the raid: the caller's row is marked ready in
 * every squad of the raid they are in, not only in the one the client is
 * showing.
 *
 * **Every raider, for themselves.** No rank: this is the answer to the check,
 * the counterpart of `POST /api/squads/raid/ready-check`, which takes one.
 * Nobody answers for anyone else — the leader who needs to mark a member ready
 * still does it row by row, through `PATCH /api/squads/members/:userId`.
 *
 * The squad check keeps its own answer, that same `PATCH` on one row: a check
 * asked of one squad is owed one squad's answer, even from a member who is in
 * two.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveRaid(request);
  if ("refused" in outcome) return outcome.refused;

  const { caller, raid } = outcome;

  if (!raid) {
    return NextResponse.json({ error: "Not in a raid" }, { status: 404 });
  }

  await markRaidMemberReady(raid.id, caller.userId, caller.name);

  /*
   * Re-read rather than patched from here: the write touched several squads,
   * and the view owes the caller all of them — their own squad, and the raid
   * board where the other rows they just filled are counted.
   */
  return NextResponse.json(
    await currentSquadView(caller, requestedSquad(request)),
  );
}
