import { NextRequest, NextResponse } from "next/server";
import { createSquadRole } from "@/lib/squads";
import {
  isSquadRoleIcon,
  ROLE_LABEL_MAX_LENGTH,
  SQUAD_MAX_ROLES,
} from "@/types/squad";
import { readBody, readString, resolveCommand, squadResponse } from "../caller";

/**
 * The squad's own list of jobs.
 *
 * Roles belong to the squad, not to the player wearing one: everybody sees the
 * same «Boarder» with the same glyph, which is what makes the icon left of a
 * name worth reading at all. There is no listing route — the roles ride along
 * with the squad on every read.
 *
 * **Whoever commands the squad writes here**, the same rank that writes the
 * announcements.
 */

/**
 * POST /api/squads/roles
 * Invents a role.
 *
 * Body: `{ label, icon }`. The icon is one of `SQUAD_ROLE_ICONS` and nothing
 * else: the client draws it from its own sprite, so a name it does not know
 * would render as a hole. This is the only place that can be refused for every
 * client at once.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveCommand();
  if ("refused" in outcome) return outcome.refused;

  const { squad, commands } = outcome;

  if (!commands) {
    return NextResponse.json(
      { error: "Only the squad leader or a lieutenant may add a role" },
      { status: 403 },
    );
  }

  if (squad.roles.length >= SQUAD_MAX_ROLES) {
    return NextResponse.json(
      { error: `A squad holds at most ${SQUAD_MAX_ROLES} roles` },
      { status: 409 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const field = readString(parsed.body, "label", ROLE_LABEL_MAX_LENGTH);
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

  const icon = (parsed.body as { icon?: unknown } | null)?.icon;

  if (!isSquadRoleIcon(icon)) {
    return NextResponse.json(
      { error: "`icon` must be one of the known role icons" },
      { status: 400 },
    );
  }

  const updated = await createSquadRole(squad.id, label, icon);

  if (!updated) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  return squadResponse(updated, { status: 201 });
}
