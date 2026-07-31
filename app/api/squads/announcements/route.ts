import { NextRequest, NextResponse } from "next/server";
import { setSquadAnnouncements } from "@/lib/squads";
import { ANNOUNCEMENTS_MAX_LENGTH } from "@/types/squad";
import { readBody, readString, resolveCommand } from "../caller";

/**
 * PATCH /api/squads/announcements
 * Rewrites what the squad is being told to do.
 *
 * Body: `{ announcements }`, replacing the whole text — it is one field a single
 * person edits, so there is nothing to merge.
 *
 * **Whoever commands the squad writes here** — the leader, or a lieutenant.
 * Everyone else reads it.
 */
export async function PATCH(request: NextRequest) {
  const outcome = await resolveCommand();
  if ("refused" in outcome) return outcome.refused;

  const { squad, commands } = outcome;

  if (!commands) {
    return NextResponse.json(
      {
        error:
          "Only the squad leader or a lieutenant may write the announcements",
      },
      { status: 403 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const field = readString(
    parsed.body,
    "announcements",
    ANNOUNCEMENTS_MAX_LENGTH,
  );

  if ("error" in field) {
    return NextResponse.json({ error: field.error }, { status: 400 });
  }

  const updated = await setSquadAnnouncements(squad.id, field.value);

  if (!updated) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  return NextResponse.json({ squad: updated });
}
