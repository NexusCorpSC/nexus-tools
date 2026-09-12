import "server-only";
import { getRaidView, getSquadsForUser, membershipsOf, pickSquad } from "@/lib/squads";
import type { SquadView } from "@/types/squad";

/**
 * Where a user stands, as their poll reads it: the squad named if they are
 * still in it, otherwise the longest-standing one they are in, the raid around
 * it, and every squad they are a member of.
 *
 * Shared by the API routes and the `/squads` page, which renders the first
 * view server-side so the roster is on screen before the first poll.
 */
export async function currentSquadView(
  userId: string,
  squadId: string | null,
): Promise<SquadView> {
  const squads = await getSquadsForUser(userId);
  const squad = pickSquad(squads, squadId);

  return {
    squad,
    raid: squad?.raidId ? await getRaidView(squad.raidId) : null,
    memberships: membershipsOf(squads),
  };
}
