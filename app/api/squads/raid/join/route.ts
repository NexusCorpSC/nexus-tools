import { NextRequest, NextResponse } from "next/server";
import { getRaidByCode } from "@/lib/raids";
import { linkSquadToRaid } from "@/lib/squads";
import { RAID_MAX_SQUADS } from "@/types/squad";
import { readBody, readString, resolveCommand, squadResponse } from "../../caller";

/** Codes are 6 characters; the cap only keeps a pathological body out. */
const CODE_MAX_LENGTH = 32;

/**
 * POST /api/squads/raid/join
 * Takes the caller's squad into the raid holding `code`.
 *
 * Body: `{ code }`, matched case-insensitively — a raid code is dictated in
 * voice as often as it is pasted, exactly like a squad's.
 *
 * **Commanding your own squad is enough.** Linking in is a decision the squad
 * makes about itself; the raid's lead squad can put it back out again, which is
 * the symmetry that makes an open door safe. Whatever raid the squad was in is
 * left first.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveCommand();
  if ("refused" in outcome) return outcome.refused;

  const { squad, commands } = outcome;

  if (!commands) {
    return NextResponse.json(
      { error: "Only the squad leader or a lieutenant may join a raid" },
      { status: 403 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const field = readString(parsed.body, "code", CODE_MAX_LENGTH);
  if ("error" in field) {
    return NextResponse.json({ error: field.error }, { status: 400 });
  }

  const raid = await getRaidByCode(field.value);

  if (!raid) {
    return NextResponse.json(
      { error: "No raid with that code" },
      { status: 404 },
    );
  }

  const linked = await linkSquadToRaid(squad, raid.id);

  if ("refusal" in linked) {
    return NextResponse.json(
      { error: `A raid holds at most ${RAID_MAX_SQUADS} squads` },
      { status: 409 },
    );
  }

  return squadResponse(linked.squad);
}
