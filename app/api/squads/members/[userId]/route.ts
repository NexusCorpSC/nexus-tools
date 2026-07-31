import { NextRequest, NextResponse } from "next/server";
import { removeSquadMember, updateSquadMember } from "@/lib/squads";
import { POSITION_MAX_LENGTH, type SquadMemberPatch } from "@/types/squad";
import { readBody, resolveCommand } from "../../caller";

/**
 * PATCH /api/squads/members/[userId]
 * Rewrites what a member reports about themselves.
 *
 * Body: `{ ready?, alive?, position?, lieutenant? }` — any subset; an absent
 * field is left alone rather than cleared.
 *
 * **Who may write what**: a member writes to their own row, and whoever commands
 * the squad — the leader or a lieutenant — writes to anyone's. That is the whole
 * rule, and it is enforced here rather than trusted from the client. Nobody can
 * reach a squad they are not in: the squad comes from the session, never from
 * the request.
 *
 * `lieutenant` is the exception to «their own row»: nobody promotes themselves,
 * so it takes command whoever the target is.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const outcome = await resolveCommand();
  if ("refused" in outcome) return outcome.refused;

  const { caller, squad, commands } = outcome;
  const { userId: targetUserId } = await params;

  const isSelf = targetUserId === caller.userId;

  if (!isSelf && !commands) {
    return NextResponse.json(
      {
        error:
          "Only the squad leader or a lieutenant may update another member",
      },
      { status: 403 },
    );
  }

  if (!squad.members.some((member) => member.userId === targetUserId)) {
    return NextResponse.json(
      { error: "No such member in this squad" },
      { status: 404 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const body = parsed.body as Record<string, unknown> | null;
  const patch: SquadMemberPatch = {};

  for (const field of ["ready", "alive"] as const) {
    const value = body?.[field];
    if (value === undefined) continue;

    if (typeof value !== "boolean") {
      return NextResponse.json(
        { error: `\`${field}\` must be a boolean` },
        { status: 400 },
      );
    }

    patch[field] = value;
  }

  if (body?.position !== undefined) {
    if (typeof body.position !== "string") {
      return NextResponse.json(
        { error: "`position` must be a string" },
        { status: 400 },
      );
    }

    if (body.position.length > POSITION_MAX_LENGTH) {
      return NextResponse.json(
        { error: `\`position\` exceeds ${POSITION_MAX_LENGTH} characters` },
        { status: 400 },
      );
    }

    patch.position = body.position;
  }

  if (body?.lieutenant !== undefined) {
    if (typeof body.lieutenant !== "boolean") {
      return NextResponse.json(
        { error: "`lieutenant` must be a boolean" },
        { status: 400 },
      );
    }

    // Not a field anyone reports about themselves: promoting is an act of
    // command, so `isSelf` buys nothing here.
    if (!commands) {
      return NextResponse.json(
        { error: "Only the squad leader or a lieutenant may appoint one" },
        { status: 403 },
      );
    }

    // The leader already outranks the rank. Letting it be set on them would
    // leave a flag that means nothing and survives a handover.
    if (targetUserId === squad.leaderId) {
      return NextResponse.json(
        { error: "The leader already commands the squad" },
        { status: 409 },
      );
    }

    patch.lieutenant = body.lieutenant;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      {
        error:
          "Nothing to update: pass `ready`, `alive`, `position` or `lieutenant`",
      },
      { status: 400 },
    );
  }

  // The stored display name is refreshed only when the member writes to their
  // own row — the leader writing on their behalf knows their own name, not
  // theirs.
  const updated = await updateSquadMember(
    squad.id,
    targetUserId,
    patch,
    isSelf ? caller.name : undefined,
  );

  if (!updated) {
    return NextResponse.json(
      { error: "No such member in this squad" },
      { status: 404 },
    );
  }

  return NextResponse.json({ squad: updated });
}

/**
 * DELETE /api/squads/members/[userId]
 * Puts a member out of the squad.
 *
 * **Whoever commands the squad, and never the leader.** A leader who wants out
 * uses `POST /api/squads/leave`, which hands the squad over on the way — removing
 * them here would leave a squad whose `leaderId` names nobody. A lieutenant who
 * wants them gone has to take the squad first, through
 * `PATCH /api/squads/leader`, which is a decision with a name on it.
 *
 * The removed member's own client finds out the ordinary way: their next poll
 * answers `{ squad: null }`, since they are in no squad anymore.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const outcome = await resolveCommand();
  if ("refused" in outcome) return outcome.refused;

  const { caller, squad, commands } = outcome;
  const { userId: targetUserId } = await params;

  if (!commands) {
    return NextResponse.json(
      { error: "Only the squad leader or a lieutenant may remove a member" },
      { status: 403 },
    );
  }

  if (targetUserId === squad.leaderId) {
    return NextResponse.json(
      { error: "The leader leaves through /api/squads/leave" },
      { status: 409 },
    );
  }

  if (targetUserId === caller.userId) {
    return NextResponse.json(
      { error: "Leave the squad rather than removing yourself" },
      { status: 409 },
    );
  }

  const updated = await removeSquadMember(squad.id, targetUserId);

  if (!updated) {
    return NextResponse.json(
      { error: "No such member in this squad" },
      { status: 404 },
    );
  }

  return NextResponse.json({ squad: updated });
}
