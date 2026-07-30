import { NextRequest, NextResponse } from "next/server";
import { removeSquadMember, updateSquadMember } from "@/lib/squads";
import { POSITION_MAX_LENGTH, type SquadMemberPatch } from "@/types/squad";
import { readBody, resolveSquad } from "../../caller";

/**
 * PATCH /api/squads/members/[userId]
 * Rewrites what a member reports about themselves.
 *
 * Body: `{ ready?, alive?, position? }` — any subset; an absent field is left
 * alone rather than cleared.
 *
 * **Who may write what**: a member writes to their own row, and the leader
 * writes to anyone's. That is the whole rule, and it is enforced here rather
 * than trusted from the client. Nobody can reach a squad they are not in: the
 * squad comes from the session, never from the request.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const outcome = await resolveSquad();
  if ("refused" in outcome) return outcome.refused;

  const { caller, squad } = outcome;
  const { userId: targetUserId } = await params;

  const isSelf = targetUserId === caller.userId;
  const isLeader = squad.leaderId === caller.userId;

  if (!isSelf && !isLeader) {
    return NextResponse.json(
      { error: "Only the squad leader may update another member" },
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

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update: pass `ready`, `alive` or `position`" },
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
 * **The leader alone, and never on themselves.** A leader who wants out uses
 * `POST /api/squads/leave`, which hands the squad over on the way — removing
 * yourself here would leave it with a leader who is no longer a member.
 *
 * The removed member's own client finds out the ordinary way: their next poll
 * answers `{ squad: null }`, since they are in no squad anymore.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const outcome = await resolveSquad();
  if ("refused" in outcome) return outcome.refused;

  const { caller, squad } = outcome;
  const { userId: targetUserId } = await params;

  if (squad.leaderId !== caller.userId) {
    return NextResponse.json(
      { error: "Only the squad leader may remove a member" },
      { status: 403 },
    );
  }

  if (targetUserId === caller.userId) {
    return NextResponse.json(
      { error: "The leader leaves through /api/squads/leave" },
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
