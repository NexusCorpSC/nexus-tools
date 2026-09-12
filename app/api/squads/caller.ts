import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  commandsSquad,
  getRaidView,
  getSquadsForUser,
  membershipsOf,
  pickSquad,
} from "@/lib/squads";
import type { RaidView, Squad, SquadView } from "@/types/squad";

/**
 * The two things every squad route starts by establishing: who is asking, and
 * which squad that puts them in.
 *
 * Shared rather than repeated per route, and colocated with them because it
 * builds the refusal to send back — a concern of the request layer, not of
 * `lib/squads.ts`, which knows nothing about HTTP.
 *
 * A user is in one squad nearly always, and then there is only «mine». A raid's
 * organiser may be in several; a request then says which one it means with
 * `?squad=<id>`, and a write that names a squad the caller is not in is
 * refused rather than redirected — `/leave` excepted, which is idempotent by
 * design and says so. Nobody can ever name someone else's.
 */

export interface Caller {
  userId: string;
  /** Kept on the member row, so a rename shows up the next time they write. */
  name: string;
}

/** A fresh response each time: one instance must not be sent twice. */
function refuse(error: string, status: number) {
  return { refused: NextResponse.json({ error }, { status }) };
}

export async function resolveCaller(): Promise<
  { refused: NextResponse } | { caller: Caller }
> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) return refuse("Unauthorized", 401);

  return {
    caller: {
      userId: session.user.id!,
      name: session.user.name ?? "Sans nom",
    },
  };
}

/** The squad a request names, or `null` when it leaves the choice to us. */
export function requestedSquad(request: Request): string | null {
  return new URL(request.url).searchParams.get("squad")?.trim() || null;
}

export async function resolveSquad(request: Request): Promise<
  { refused: NextResponse } | { caller: Caller; squad: Squad }
> {
  const outcome = await resolveCaller();
  if ("refused" in outcome) return outcome;

  const squads = await getSquadsForUser(outcome.caller.userId);
  if (squads.length === 0) return refuse("Not in a squad", 404);

  const named = requestedSquad(request);

  if (named) {
    const squad = squads.find((candidate) => candidate.id === named);
    if (!squad) return refuse("Not in that squad", 404);

    return { caller: outcome.caller, squad };
  }

  return { caller: outcome.caller, squad: squads[0] };
}

/**
 * The squad, plus whether the caller gives the orders in it.
 *
 * Every route that writes on someone else's behalf asks exactly this: the leader
 * and the lieutenants they appointed are indistinguishable past this point,
 * which is the whole point of the rank.
 */
export async function resolveCommand(request: Request): Promise<
  | { refused: NextResponse }
  | { caller: Caller; squad: Squad; commands: boolean }
> {
  const outcome = await resolveSquad(request);
  if ("refused" in outcome) return outcome;

  return {
    ...outcome,
    commands: commandsSquad(outcome.squad, outcome.caller.userId),
  };
}

/** Reads a string field off a parsed body, or says what is wrong with it. */
export function readString(
  body: unknown,
  field: string,
  maxLength: number,
): { value: string } | { error: string } {
  const value = (body as Record<string, unknown> | null)?.[field];

  if (typeof value !== "string")
    return { error: `\`${field}\` must be a string` };

  if (value.length > maxLength) {
    return { error: `\`${field}\` exceeds ${maxLength} characters` };
  }

  return { value };
}

export async function readBody(
  request: Request,
): Promise<{ body: unknown } | { refused: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return refuse("Invalid JSON body", 400);
  }
}

/**
 * Reads an optional `{ name? }` body, the shape every «start one» route takes.
 *
 * An absent body is the normal case: a squad rarely has a name worth typing
 * while a drop is starting. A present but unusable one is still an error —
 * which is why the text is read before being parsed. `json()` throws the same
 * way for both, and answering 201 to a request nobody could read would hide a
 * client bug behind a squad named after its owner.
 *
 * `[]`, `"x"` and `null` parse, and none of them is a `{ name? }`. Reading
 * `.name` off them would answer 201 to a request nobody could honour.
 */
export async function readOptionalName(
  request: Request,
  maxLength: number,
): Promise<{ name: string | undefined } | { refused: NextResponse }> {
  const raw = (await request.text()).trim();
  if (!raw) return { name: undefined };

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return refuse("Invalid JSON body", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return refuse("Body must be an object", 400);
  }

  const requested = (body as { name?: unknown }).name;

  if (requested === undefined) return { name: undefined };

  if (typeof requested !== "string") {
    return refuse("`name` must be a string", 400);
  }

  if (requested.length > maxLength) {
    return refuse(`\`name\` exceeds ${maxLength} characters`, 400);
  }

  return { name: requested.trim() || undefined };
}

/* ------------------------------------------------------------------ */
/* Answering                                                           */
/* ------------------------------------------------------------------ */

/**
 * What every squad route answers with: where the caller stands, whole.
 *
 * The raid is resolved on the way out rather than asked for separately, so the
 * overlay draws every sub-squad from the one poll it already makes. It costs a
 * second query only for the squads that are actually in a raid — and a read of
 * the caller's memberships, which is the same indexed query the poll starts
 * with.
 *
 * `squad` is taken as the route left it rather than re-read, so the answer
 * reflects the write that was just made; the memberships are re-read so that a
 * squad just opened, or just left, shows up in the list at once.
 */
export async function squadView(
  caller: Caller,
  squad: Squad | null,
): Promise<SquadView> {
  const memberships = membershipsOf(await getSquadsForUser(caller.userId));

  if (!squad) return { squad: null, raid: null, memberships };

  return {
    squad,
    raid: squad.raidId ? await getRaidView(squad.raidId) : null,
    memberships,
  };
}

/**
 * The view as the caller's poll would read it: the squad named if they are
 * still in it, and otherwise the longest-standing one they are in. For the
 * read, and for the one write that may have taken them out of the squad they
 * named.
 */
export async function currentSquadView(
  caller: Caller,
  squadId: string | null,
): Promise<SquadView> {
  const squads = await getSquadsForUser(caller.userId);
  const squad = pickSquad(squads, squadId);

  return {
    squad,
    raid: squad?.raidId ? await getRaidView(squad.raidId) : null,
    memberships: membershipsOf(squads),
  };
}

export async function squadResponse(
  caller: Caller,
  squad: Squad | null,
  init?: ResponseInit,
): Promise<NextResponse> {
  return NextResponse.json(await squadView(caller, squad), init);
}

/**
 * The caller's squad, the raid around it, and who they are allowed to be in
 * each.
 *
 * Two ranks, not one: `commands` is the squad's — the leader or a lieutenant —
 * and `leads` is the raid's, which is the same rank held in the squad that runs
 * the raid. A raid has no members of its own, so there is nothing else it could
 * be: whoever the squads trust with their own squad is who speaks for them.
 */
export async function resolveRaid(request: Request): Promise<
  | { refused: NextResponse }
  | {
      caller: Caller;
      squad: Squad;
      raid: RaidView | null;
      commands: boolean;
      leads: boolean;
    }
> {
  const outcome = await resolveCommand(request);
  if ("refused" in outcome) return outcome;

  const { caller, squad, commands } = outcome;
  const raid = squad.raidId ? await getRaidView(squad.raidId) : null;

  return {
    caller,
    squad,
    raid,
    commands,
    leads: Boolean(raid && raid.leadSquadId === squad.id && commands),
  };
}
