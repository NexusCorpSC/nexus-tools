import { NextRequest, NextResponse } from "next/server";
import { joinSquad } from "@/lib/squads";
import { readBody, readString, resolveCaller } from "../caller";

/** Codes are 6 characters; the cap only keeps a pathological body out. */
const CODE_MAX_LENGTH = 32;

/**
 * POST /api/squads/join
 * Joins the squad holding `code`.
 *
 * Body: `{ code }`, matched case-insensitively — a code is dictated as often as
 * it is pasted.
 *
 * Whatever squad the caller was in is left first, one at a time. Joining a squad
 * they are already in answers with it rather than an error: a client retrying is
 * not a mistake, and nothing changed.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveCaller();
  if ("refused" in outcome) return outcome.refused;

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const field = readString(parsed.body, "code", CODE_MAX_LENGTH);
  if ("error" in field) {
    return NextResponse.json({ error: field.error }, { status: 400 });
  }

  const joined = await joinSquad(
    outcome.caller.userId,
    outcome.caller.name,
    field.value,
  );

  if ("refusal" in joined) {
    switch (joined.refusal) {
      case "full":
        return NextResponse.json({ error: "Squad is full" }, { status: 409 });
      // Two of the caller's clients joining at once: one of them won, and it is
      // not this one. Refused rather than papered over — they are in a squad,
      // just not the one this request asked for.
      case "elsewhere":
        return NextResponse.json(
          { error: "Already in another squad" },
          { status: 409 },
        );
      default:
        return NextResponse.json(
          { error: "No squad with that code" },
          { status: 404 },
        );
    }
  }

  return NextResponse.json({ squad: joined.squad });
}
