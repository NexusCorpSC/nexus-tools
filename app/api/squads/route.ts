import { NextRequest, NextResponse } from "next/server";
import { createSquad, getSquadForUser, setSquadName } from "@/lib/squads";
import { SQUAD_NAME_MAX_LENGTH } from "@/types/squad";
import {
  readBody,
  readString,
  resolveCaller,
  resolveCommand,
  squadResponse,
  squadView,
} from "./caller";

/**
 * The caller's squad, as a resource of its own.
 *
 * There is no listing and no squad id anywhere: a user is in one squad at a
 * time, so this route is «mine» and nothing else. Squads are private by
 * construction — the only way in is a code someone hands you.
 */

/**
 * GET /api/squads
 * The squad the caller is in, or `{ squad: null }` when they are in none.
 */
export async function GET() {
  const outcome = await resolveCaller();
  if ("refused" in outcome) return outcome.refused;

  const squad = await getSquadForUser(outcome.caller.userId);

  return NextResponse.json(await squadView(squad));
}

/**
 * POST /api/squads
 * Starts a squad, the caller its leader and only member.
 *
 * Body: `{ name? }`. Whatever squad the caller was in is left first — one at a
 * time — which hands over the leadership of that one if it was theirs.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveCaller();
  if ("refused" in outcome) return outcome.refused;

  const { caller } = outcome;

  /*
   * An absent body is the normal case: a squad rarely has a name worth typing
   * while a drop is starting. A present but unusable one is still an error —
   * which is why the text is read before being parsed. `json()` throws the same
   * way for both, and answering 201 to a request nobody could read would hide a
   * client bug behind a squad named after its owner.
   */
  const raw = (await request.text()).trim();
  let body: unknown = null;

  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    // `[]`, `"x"` and `null` parse, and none of them is a `{ name? }`. Reading
    // `.name` off them would answer 201 to a request nobody could honour, which
    // is a client bug this route would be hiding rather than reporting.
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Body must be an object" },
        { status: 400 },
      );
    }
  }

  const requested = (body as { name?: unknown } | null)?.name;

  if (requested !== undefined && typeof requested !== "string") {
    return NextResponse.json(
      { error: "`name` must be a string" },
      { status: 400 },
    );
  }

  if (
    typeof requested === "string" &&
    requested.length > SQUAD_NAME_MAX_LENGTH
  ) {
    return NextResponse.json(
      { error: `\`name\` exceeds ${SQUAD_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const name = requested?.trim() || `Escouade de ${caller.name}`;

  const created = await createSquad(caller.userId, name, caller.name);

  // The caller joined something else while this was being handled — two of their
  // clients racing. Nothing was created, and saying so beats answering 201 with
  // a squad they are not in.
  if ("refusal" in created) {
    return NextResponse.json(
      { error: "Already in another squad" },
      { status: 409 },
    );
  }

  return squadResponse(created.squad, { status: 201 });
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
  const outcome = await resolveCommand();
  if ("refused" in outcome) return outcome.refused;

  const { squad, commands } = outcome;

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

  return squadResponse(updated);
}
