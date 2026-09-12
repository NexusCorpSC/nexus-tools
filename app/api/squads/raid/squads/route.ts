import { NextRequest, NextResponse } from "next/server";
import { createSquadInRaid } from "@/lib/squads";
import { RAID_MAX_SQUADS, SQUAD_NAME_MAX_LENGTH } from "@/types/squad";
import { readOptionalName, resolveRaid, squadResponse } from "../../caller";

/**
 * POST /api/squads/raid/squads
 * Opens another squad in the raid, the caller leading it.
 *
 * Body: `{ name? }`. The squad starts with the caller as its leader and only
 * member — an empty squad cannot exist, the last member out deletes it — and
 * **they stay in the squad they came from**. This is the one way a player ends
 * up in more than one squad, and the reason the API takes `?squad=<id>`: the
 * organiser opens Bravo and Charlie before anyone is in them, hands each code
 * out, and passes the lead on once the right person has joined.
 *
 * **Whoever commands the lead squad.** Composing the raid is the lead squad's
 * job, the same rank that unlinks a squad from it.
 *
 * Answers the view of the squad the request came from, not of the new one: the
 * caller is still in Alpha, and switching them is the client's call. The new
 * squad is in `raid.squads` and in `memberships`.
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
          "Only the leader or a lieutenant of the raid's lead squad may open a squad",
      },
      { status: 403 },
    );
  }

  const read = await readOptionalName(request, SQUAD_NAME_MAX_LENGTH);
  if ("refused" in read) return read.refused;

  const name = read.name ?? `Escouade ${raid.squads.length + 1}`;

  const created = await createSquadInRaid(
    caller.userId,
    name,
    caller.name,
    raid.id,
  );

  if ("refusal" in created) {
    return NextResponse.json(
      { error: `A raid holds at most ${RAID_MAX_SQUADS} squads` },
      { status: 409 },
    );
  }

  return squadResponse(caller, squad, { status: 201 });
}
