import { NextRequest, NextResponse } from "next/server";
import { createRaid, updateRaid } from "@/lib/raids";
import { linkSquadToRaid, unlinkSquadFromRaid } from "@/lib/squads";
import {
  ANNOUNCEMENTS_MAX_LENGTH,
  RAID_NAME_MAX_LENGTH,
} from "@/types/squad";
import {
  readBody,
  readOptionalName,
  readString,
  resolveCommand,
  resolveRaid,
  squadResponse,
} from "../caller";

/**
 * The raid the caller's squad is in.
 *
 * A raid is several squads under one announcement, and nothing more: it holds
 * no roster of its own — its squads are whichever ones point at it — and each
 * of them keeps its code, its leader and its roles. There is no raid id in any
 * of these routes: «my squad» comes from the session (or from `?squad=<id>`,
 * for the organiser who is in several), and the raid comes from my squad.
 *
 * **Two ranks.** Commanding your own squad is enough to take it into a raid or
 * out of one. Renaming the raid, writing its announcement and unlinking
 * *somebody else's* squad take commanding the **lead squad** — the one that
 * started the raid, or the one the lead was handed down to. A raid has no
 * members of its own, so there is nothing else the rank could rest on: whoever
 * a squad trusts with itself is who speaks for it here.
 *
 * The raid is read back on the caller's ordinary poll — `GET /api/squads`
 * answers `{ squad, raid }`, the raid carrying every sub-squad.
 */

/**
 * POST /api/squads/raid
 * Starts a raid, the caller's squad running it.
 *
 * Body: `{ name? }`. Whatever raid the squad was in is left first — one at a
 * time, the same rule a player is held to for squads.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveCommand(request);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squad, commands } = outcome;

  if (!commands) {
    return NextResponse.json(
      { error: "Only the squad leader or a lieutenant may start a raid" },
      { status: 403 },
    );
  }

  const read = await readOptionalName(request, RAID_NAME_MAX_LENGTH);
  if ("refused" in read) return read.refused;

  const name = read.name ?? `Raid de ${squad.name}`;

  const raid = await createRaid(name, squad.id);
  const linked = await linkSquadToRaid(squad, raid.id);

  // Unreachable: a raid created a line ago holds no squads, so the cap cannot
  // refuse. Handled rather than asserted because the alternative is answering
  // 201 with a raid the caller is not in.
  if ("refusal" in linked) {
    return NextResponse.json(
      { error: "Could not join the raid that was just created" },
      { status: 500 },
    );
  }

  return squadResponse(caller, linked.squad, { status: 201 });
}

/**
 * PATCH /api/squads/raid
 * Renames the raid, rewrites its announcement, or both.
 *
 * Body: `{ name?, announcement? }` — at least one; the announcement replaces
 * the whole text, as the squad's own does.
 *
 * **Whoever commands the lead squad.** This is the one thing a raid exists for:
 * one message, read in the overlay of every player in every sub-squad.
 */
export async function PATCH(request: NextRequest) {
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
          "Only the leader or a lieutenant of the raid's lead squad may write here",
      },
      { status: 403 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const body = parsed.body as Record<string, unknown> | null;
  const patch: { name?: string; announcement?: string } = {};

  if (body?.name !== undefined) {
    const field = readString(body, "name", RAID_NAME_MAX_LENGTH);
    if ("error" in field) {
      return NextResponse.json({ error: field.error }, { status: 400 });
    }

    const name = field.value.trim();
    if (!name) {
      return NextResponse.json(
        { error: "`name` must not be empty" },
        { status: 400 },
      );
    }

    patch.name = name;
  }

  if (body?.announcement !== undefined) {
    const field = readString(body, "announcement", ANNOUNCEMENTS_MAX_LENGTH);
    if ("error" in field) {
      return NextResponse.json({ error: field.error }, { status: 400 });
    }

    patch.announcement = field.value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update: pass `name` or `announcement`" },
      { status: 400 },
    );
  }

  const updated = await updateRaid(raid.id, patch);

  if (!updated) {
    return NextResponse.json({ error: "Raid not found" }, { status: 404 });
  }

  return squadResponse(caller, squad);
}

/**
 * DELETE /api/squads/raid
 * Takes the caller's squad out of the raid.
 *
 * A departure rather than a dissolution, even from the lead squad: the raid
 * outlives whoever started it, its lead passing to the longest-standing squad
 * left. Only the last squad out removes it — the same bargain a squad strikes
 * with its own leader in `POST /api/squads/leave`.
 *
 * Idempotent: a squad in no raid answers the same view it would have anyway.
 */
export async function DELETE(request: NextRequest) {
  const outcome = await resolveCommand(request);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squad, commands } = outcome;

  if (!commands) {
    return NextResponse.json(
      {
        error: "Only the squad leader or a lieutenant may leave a raid",
      },
      { status: 403 },
    );
  }

  const updated = await unlinkSquadFromRaid(squad);

  return squadResponse(caller, updated ?? squad);
}
