import { NextRequest, NextResponse } from "next/server";
import { requestRaidReadyCheck } from "@/lib/squads";
import { resolveRaid, squadResponse } from "../../caller";

/**
 * POST /api/squads/raid/ready-check?squad=<id>
 * The ready check, asked of the whole raid: every member of every squad in it
 * goes back to not ready, and the raid is stamped with the check.
 *
 * **Whoever commands the lead squad.** The squads' own commanders keep their
 * own check (`POST /api/squads/ready-check`) for their squad alone.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveRaid(request);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squad, raid, leads } = outcome;

  if (!raid) {
    return NextResponse.json({ error: "Not in a raid" }, { status: 404 });
  }

  if (!leads) {
    return NextResponse.json(
      {
        error:
          "Only the leader or a lieutenant of the raid's lead squad may ask the raid for a ready check",
      },
      { status: 403 },
    );
  }

  const updated = await requestRaidReadyCheck(raid.id, caller.name);

  if (!updated) {
    return NextResponse.json({ error: "Raid not found" }, { status: 404 });
  }

  // The caller's own squad, as the reset left it: the view is re-read around
  // it, raid included.
  const mine = updated.squads.find((sub) => sub.id === squad.id) ?? squad;

  return squadResponse(caller, mine);
}
