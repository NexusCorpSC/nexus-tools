import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { commandsSquad, getRaidView, getSquadForUser } from "@/lib/squads";
import type { RaidView, Squad, SquadView } from "@/types/squad";

/**
 * The two things every squad route starts by establishing: who is asking, and
 * which squad that puts them in.
 *
 * Shared rather than repeated per route, and colocated with them because it
 * builds the refusal to send back — a concern of the request layer, not of
 * `lib/squads.ts`, which knows nothing about HTTP.
 *
 * A user belongs to one squad at a time, so no route takes a squad id: there is
 * only ever «mine», and nobody can name someone else's.
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

export async function resolveSquad(): Promise<
  { refused: NextResponse } | { caller: Caller; squad: Squad }
> {
  const outcome = await resolveCaller();
  if ("refused" in outcome) return outcome;

  const squad = await getSquadForUser(outcome.caller.userId);
  if (!squad) return refuse("Not in a squad", 404);

  return { caller: outcome.caller, squad };
}

/**
 * The squad, plus whether the caller gives the orders in it.
 *
 * Every route that writes on someone else's behalf asks exactly this: the leader
 * and the lieutenants they appointed are indistinguishable past this point,
 * which is the whole point of the rank.
 */
export async function resolveCommand(): Promise<
  | { refused: NextResponse }
  | { caller: Caller; squad: Squad; commands: boolean }
> {
  const outcome = await resolveSquad();
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

/* ------------------------------------------------------------------ */
/* Answering                                                           */
/* ------------------------------------------------------------------ */

/**
 * What every squad route answers with: where the caller stands, whole.
 *
 * The raid is resolved on the way out rather than asked for separately, so the
 * overlay draws every sub-squad from the one poll it already makes. It costs a
 * second query only for the squads that are actually in a raid.
 */
export async function squadView(squad: Squad | null): Promise<SquadView> {
  if (!squad?.raidId) return { squad, raid: null };

  return { squad, raid: await getRaidView(squad.raidId) };
}

export async function squadResponse(
  squad: Squad | null,
  init?: ResponseInit,
): Promise<NextResponse> {
  return NextResponse.json(await squadView(squad), init);
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
export async function resolveRaid(): Promise<
  | { refused: NextResponse }
  | {
      caller: Caller;
      squad: Squad;
      raid: RaidView | null;
      commands: boolean;
      leads: boolean;
    }
> {
  const outcome = await resolveCommand();
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
