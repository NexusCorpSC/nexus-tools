import { NextRequest, NextResponse } from "next/server";
import { unlinkSquadFromRaid } from "@/lib/squads";
import { resolveRaid, squadResponse } from "../../../caller";

/**
 * DELETE /api/squads/raid/squads/[squadId]
 * Puts another squad out of the raid.
 *
 * **Whoever commands the lead squad**, and never their own squad: a lead squad
 * leaving its own raid goes through `DELETE /api/squads/raid`, which arranges
 * the succession this route knows nothing about.
 *
 * The removed squad finds out the ordinary way — its next poll answers a view
 * with no raid in it. Nothing else about it changes: it keeps its code, its
 * members and its roles, and can link into another raid straight away.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ squadId: string }> },
) {
  const outcome = await resolveRaid();
  if ("refused" in outcome) return outcome.refused;

  const { squad, raid, leads } = outcome;
  const { squadId } = await params;

  if (!raid) {
    return NextResponse.json({ error: "Not in a raid" }, { status: 404 });
  }

  if (!leads) {
    return NextResponse.json(
      {
        error:
          "Only the leader or a lieutenant of the raid's lead squad may unlink a squad",
      },
      { status: 403 },
    );
  }

  if (squadId === squad.id) {
    return NextResponse.json(
      { error: "Leave the raid rather than unlinking yourself" },
      { status: 409 },
    );
  }

  const target = raid.squads.find((candidate) => candidate.id === squadId);

  if (!target) {
    return NextResponse.json(
      { error: "No such squad in this raid" },
      { status: 404 },
    );
  }

  await unlinkSquadFromRaid(target);

  return squadResponse(squad);
}
