import { NextRequest, NextResponse } from "next/server";
import { deleteSquadRole, updateSquadRole } from "@/lib/squads";
import {
  isSquadRoleIcon,
  ROLE_LABEL_MAX_LENGTH,
  type SquadRoleIcon,
} from "@/types/squad";
import {
  readBody,
  readString,
  resolveCommand,
  squadResponse,
} from "../../caller";

/**
 * One role of the caller's squad. No squad id anywhere, as everywhere else
 * here: the squad comes from the session, so a role id from another squad
 * simply names nothing.
 */

/**
 * PATCH /api/squads/roles/[roleId]
 * Renames a role, changes its glyph, or both.
 *
 * Body: `{ label?, icon? }` — at least one.
 *
 * Base roles are editable: «Médic» is a suggestion the squad is free to call
 * something else. What they are not is deletable — see `DELETE` below.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
) {
  const outcome = await resolveCommand();
  if ("refused" in outcome) return outcome.refused;

  const { squad, commands } = outcome;
  const { roleId } = await params;

  if (!commands) {
    return NextResponse.json(
      { error: "Only the squad leader or a lieutenant may edit a role" },
      { status: 403 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const body = parsed.body as Record<string, unknown> | null;
  const patch: { label?: string; icon?: SquadRoleIcon } = {};

  if (body?.label !== undefined) {
    const field = readString(body, "label", ROLE_LABEL_MAX_LENGTH);
    if ("error" in field) {
      return NextResponse.json({ error: field.error }, { status: 400 });
    }

    const label = field.value.trim();
    if (!label) {
      return NextResponse.json(
        { error: "`label` must not be empty" },
        { status: 400 },
      );
    }

    patch.label = label;
  }

  if (body?.icon !== undefined) {
    if (!isSquadRoleIcon(body.icon)) {
      return NextResponse.json(
        { error: "`icon` must be one of the known role icons" },
        { status: 400 },
      );
    }

    patch.icon = body.icon;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update: pass `label` or `icon`" },
      { status: 400 },
    );
  }

  const updated = await updateSquadRole(squad.id, roleId, patch);

  if (!updated) {
    return NextResponse.json(
      { error: "No such role in this squad" },
      { status: 404 },
    );
  }

  return squadResponse(updated);
}

/**
 * DELETE /api/squads/roles/[roleId]
 * Drops a role, and takes it off everyone wearing it.
 *
 * **Never one of the seven the squad started with.** They can be renamed and
 * re-drawn, but a squad that deleted its way down to nothing would leave the
 * overlay with an empty picker and no way to refill it — and the seven cost
 * nothing to leave alone.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
) {
  const outcome = await resolveCommand();
  if ("refused" in outcome) return outcome.refused;

  const { squad, commands } = outcome;
  const { roleId } = await params;

  if (!commands) {
    return NextResponse.json(
      { error: "Only the squad leader or a lieutenant may remove a role" },
      { status: 403 },
    );
  }

  const role = squad.roles.find((candidate) => candidate.id === roleId);

  if (!role) {
    return NextResponse.json(
      { error: "No such role in this squad" },
      { status: 404 },
    );
  }

  if (role.base) {
    return NextResponse.json(
      { error: "A role the squad starts with cannot be removed, only renamed" },
      { status: 409 },
    );
  }

  const updated = await deleteSquadRole(squad.id, roleId);

  // The role was there a moment ago, when this route read the squad. Another
  // commander deleting the same one is the ordinary way to get here.
  if (!updated) {
    return NextResponse.json(
      { error: "No such role in this squad" },
      { status: 404 },
    );
  }

  return squadResponse(updated);
}
