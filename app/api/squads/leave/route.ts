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
 * is still in Alpha — and `{ squad: null }` otherwise.
 *
 * **Idempotent, on purpose, and the one write that is.** Every other route
 * refuses a `squad` the caller is not in; this one answers the view instead,
 * because «not in it» is exactly what leaving asks for, and the id most likely
 * to be stale here is the one a client is holding of a squad it was just put
 * out of — a 404 on that would show an error for a wish already granted.
 * Naming a squad they are not in leaves nothing, rather than some other
 * squad than the one asked for.
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
