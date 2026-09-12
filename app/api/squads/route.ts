import { NextRequest, NextResponse } from "next/server";
import { createSquad, setSquadName } from "@/lib/squads";
import { SQUAD_NAME_MAX_LENGTH } from "@/types/squad";
import {
  currentSquadView,
  readBody,
  readOptionalName,
  readString,
  requestedSquad,
  resolveCaller,
  resolveCommand,
  squadResponse,
} from "./caller";

/**
 * The caller's squad, as a resource of its own.
 *
 * There is no listing: this route is «mine» and nothing else. Squads are
 * private by construction — the only way in is a code someone hands you. A
 * caller in several squads — a raid's organiser who opened them — names the one
 * they mean with `?squad=<id>`; every route under here takes it.
 */

/**
 * GET /api/squads?squad=<id>
 * The squad the caller is in, or `{ squad: null }` when they are in none.
 *
 * With `squad`, that one — provided they are still in it; otherwise, or
 * without, the longest-standing of their memberships, which is the one squad
 * for everybody who is in one. `memberships` lists them all either way.
 */
export async function GET(request: NextRequest) {
  const outcome = await resolveCaller();
  if ("refused" in outcome) return outcome.refused;

  return NextResponse.json(
    await currentSquadView(outcome.caller, requestedSquad(request)),
  );
}

/**
 * POST /api/squads
 * Starts a squad, the caller its leader and only member.
 *
 * Body: `{ name? }`. Whatever squads the caller was in are left first — this
 * is starting over, not adding a membership — which hands over the leadership
 * of each one that was theirs. Opening a squad *alongside* is
 * `POST /api/squads/raid/squads`.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveCaller();
  if ("refused" in outcome) return outcome.refused;

  const { caller } = outcome;

  const read = await readOptionalName(request, SQUAD_NAME_MAX_LENGTH);
  if ("refused" in read) return read.refused;

  const name = read.name ?? `Escouade de ${caller.name}`;

  const created = await createSquad(caller.userId, name, caller.name);

  return squadResponse(caller, created, { status: 201 });
}

/**
 * PATCH /api/squads
 * Renames the squad.
 *
 * Body: `{ name }` — trimmed, and refused when empty: a squad with no name is
 * a row of blank pixels in the overlay's title bar, and the creation route
 * already guarantees every squad has one.
 *
 * **Whoever commands the squad** — the leader, or a lieutenant. The name is
 * read by everyone and typed by the few, like the announcements beside it.
 */
export async function PATCH(request: NextRequest) {
  const outcome = await resolveCommand(request);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squad, commands } = outcome;

  if (!commands) {
    return NextResponse.json(
      { error: "Only the squad leader or a lieutenant may rename the squad" },
      { status: 403 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const field = readString(parsed.body, "name", SQUAD_NAME_MAX_LENGTH);
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

  const updated = await setSquadName(squad.id, name);

  if (!updated) {
    return NextResponse.json({ error: "Squad not found" }, { status: 404 });
  }

  return squadResponse(caller, updated);
}
