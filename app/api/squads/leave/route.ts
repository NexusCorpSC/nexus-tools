import { NextRequest, NextResponse } from "next/server";
import { getSquadForUser, leaveSquad } from "@/lib/squads";
import { currentSquadView, requestedSquad, resolveCaller } from "../caller";

/**
 * POST /api/squads/leave?squad=<id>
 * Takes the caller out of their squad — the one named, or the longest-standing
 * one they are in.
 *
 * A `POST` rather than a `DELETE` on `/api/squads`: what is being deleted is a
 * membership, not the squad — which survives, its leadership handed to the
 * longest-standing member left. Only the last one out removes it.
 *
 * Answers the view as the caller's next poll would read it: the squad they are
 * still in if there is one — a raid's organiser leaving the Bravo they opened
 * is still in Alpha — and `{ squad: null }` otherwise. Idempotent: leaving when
 * in no squad, or naming one they are not in, changes nothing and answers the
 * same view.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveCaller();
  if ("refused" in outcome) return outcome.refused;

  const { caller } = outcome;
  const named = requestedSquad(request);

  // Only the squad actually named is left. Without a name, the default is the
  // one squad nearly everyone is in; with a stale one, nothing is left at all,
  // rather than some other squad than the one asked for.
  const squad = await getSquadForUser(caller.userId, named);

  if (squad && (!named || squad.id === named)) {
    await leaveSquad(caller.userId, squad.id);
  }

  return NextResponse.json(await currentSquadView(caller, null));
}
