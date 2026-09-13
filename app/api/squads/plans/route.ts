import { NextRequest, NextResponse } from "next/server";
import {
  createPlan,
  duplicatePlan,
  getPlan,
  getPlansOfOwner,
  type PlanScopeRef,
} from "@/lib/plans";
import {
  PHASE_NAME_MAX_LENGTH,
  PLAN_MAX_ACTIVE_PER_OWNER,
  PLAN_MAX_PER_OWNER,
  PLAN_NAME_MAX_LENGTH,
} from "@/types/plan";
import { planResponse, refuseRank, resolveScope } from "./caller";

/**
 * The plans de vol of the caller's scope.
 *
 * A squad in a raid briefs with the raid; one running alone briefs on its own.
 * No route names a scope: «my squad» comes from the session (or from
 * `?squad=<id>`, for the organiser who is in several), and the scope comes from
 * my squad.
 *
 * **Whoever commands writes here** — the squad's leader or a lieutenant for a
 * squad's plans, the lead squad's for a raid's. Drawing is another question
 * entirely, and `drawPolicy` answers it: by default everybody draws, because a
 * briefing is not a lecture.
 */

/**
 * The `{ name?, from?, firstPhase? }` body, all three optional.
 *
 * An absent body is the normal case — «start a plan» rarely comes with a name
 * typed for it — which is why this is not `readBody`: `json()` throws on an
 * empty body the same way it throws on a broken one, and the two deserve
 * opposite answers.
 */
async function readStart(request: Request): Promise<
  | { refused: NextResponse }
  | { name?: string; from?: string; firstPhase?: string }
> {
  const raw = (await request.text()).trim();
  if (!raw) return {};

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return {
      refused: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      refused: NextResponse.json(
        { error: "Body must be an object" },
        { status: 400 },
      ),
    };
  }

  const fields = body as Record<string, unknown>;
  const read: { name?: string; from?: string; firstPhase?: string } = {};

  for (const [field, max] of [
    ["name", PLAN_NAME_MAX_LENGTH],
    ["from", 64],
    ["firstPhase", PHASE_NAME_MAX_LENGTH],
  ] as const) {
    const value = fields[field];
    if (value === undefined) continue;

    if (typeof value !== "string") {
      return {
        refused: NextResponse.json(
          { error: `\`${field}\` must be a string` },
          { status: 400 },
        ),
      };
    }

    if (value.length > max) {
      return {
        refused: NextResponse.json(
          { error: `\`${field}\` exceeds ${max} characters` },
          { status: 400 },
        ),
      };
    }

    const trimmed = value.trim();
    if (trimmed) read[field] = trimmed;
  }

  return read;
}

/**
 * GET /api/squads/plans
 * Every plan of the scope, archived ones included.
 *
 * The archived are here and not in the feed on purpose: the stream carries what
 * a briefing is working on, this carries the shelf you pick last month's plan
 * off. `plan` is null — a listing names none.
 */
export async function GET(request: NextRequest) {
  const outcome = await resolveScope(request);
  if ("refused" in outcome) return outcome.refused;

  const { ref } = outcome;

  return NextResponse.json({
    feed: {
      scope: ref.scope,
      ownerId: ref.ownerId,
      plans: await getPlansOfOwner(ref.ownerId),
    },
    plan: null,
  });
}

/**
 * POST /api/squads/plans
 * Starts a plan, blank or from one the squad already drew.
 *
 * Body: `{ name?, from?, firstPhase? }`. `from` is the id of a plan of the same
 * scope to copy — strokes and all, which is the whole point of «repartir d'un
 * plan»: a raid going back to the same station corrects last time's drawing
 * rather than redrawing the station.
 */
export async function POST(request: NextRequest) {
  const outcome = await resolveScope(request);
  if ("refused" in outcome) return outcome.refused;

  const { caller, ref, governs } = outcome;

  if (!governs) return refuseRank(ref.scope, "start a plan");

  const read = await readStart(request);
  if ("refused" in read) return read.refused;

  const created = read.from
    ? await copyOf(read.from, ref, caller.userId, read.name)
    : await createPlan(
        ref,
        caller.userId,
        read.name ?? "Plan de vol",
        read.firstPhase ?? "Phase 1",
      );

  if ("refusal" in created) {
    if (created.refusal === "source") {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        error:
          created.refusal === "full"
            ? `A squad or raid runs at most ${PLAN_MAX_ACTIVE_PER_OWNER} plans at once — archive one first`
            : `A squad or raid keeps at most ${PLAN_MAX_PER_OWNER} plans — delete an old one first`,
      },
      { status: 409 },
    );
  }

  return planResponse(caller, ref.squadId, created.plan, { status: 201 });
}

/** The copy, and the one refusal a copy has that a blank plan does not. */
async function copyOf(
  from: string,
  ref: PlanScopeRef,
  createdBy: string,
  name: string | undefined,
) {
  const source = await getPlan(from);

  // A plan of somebody else's scope is not copied, and not admitted to exist.
  if (!source || source.ownerId !== ref.ownerId) {
    return { refusal: "source" as const };
  }

  return duplicatePlan(source, ref, createdBy, name ?? `${source.name} (copie)`);
}
