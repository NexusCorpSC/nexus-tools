import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSquadForUser } from "@/lib/squads";
import type { Squad } from "@/types/squad";

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
