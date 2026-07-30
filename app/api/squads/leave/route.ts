import { NextResponse } from "next/server";
import { leaveSquad } from "@/lib/squads";
import { resolveCaller } from "../caller";

/**
 * POST /api/squads/leave
 * Takes the caller out of their squad.
 *
 * A `POST` rather than a `DELETE` on `/api/squads`: what is being deleted is a
 * membership, not the squad — which survives, its leadership handed to the
 * longest-standing member left. Only the last one out removes it.
 *
 * Idempotent: leaving when in no squad answers the same `{ squad: null }`.
 */
export async function POST() {
  const outcome = await resolveCaller();
  if ("refused" in outcome) return outcome.refused;

  await leaveSquad(outcome.caller.userId);

  return NextResponse.json({ squad: null });
}
