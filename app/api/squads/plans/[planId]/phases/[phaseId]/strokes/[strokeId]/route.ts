import { NextRequest, NextResponse } from "next/server";
import {
  eraseStroke,
  moveStroke,
  relabelStroke,
  restoreStroke,
  strokeAuthor,
  type StrokeRefusal,
} from "@/lib/plans";
import {
  PHASE_MAX_STROKES,
  PLAN_GRID,
  STROKE_MAX_POINTS,
  STROKE_TEXT_MAX_LENGTH,
} from "@/types/plan";
import { readBody } from "../../../../../../caller";
import { resolvePlan } from "../../../../../caller";

/**
 * One trace: rubbed out, moved, renamed, or brought back.
 *
 * All four supersede it under a fresh revision rather than mutating it quietly
 * — that is what makes a removal, a move and a resurrection reach everybody the
 * same way a drawing does. None answers a `PlanView`: like the commit, they
 * answer the stroke, and the plan's own change rides the event stream.
 *
 * **Every one of them only touches your own.** Whoever runs the plan is excused
 * from that question and no one else is; emptying a whole phase is
 * `DELETE …/strokes`.
 */

/**
 * PATCH …/strokes/[strokeId]
 * Moves a trace, renames it, or brings it back from the dead.
 *
 * Body: `{ points }` to move — a token following the squad from one phase to
 * the next, mostly; `{ text }` to name a marker dropped before it was named;
 * `{ restore: true }` to raise the tombstone, which is what «annuler» is built
 * on. All three ride one verb rather than three routes because they are one
 * operation seen three ways: supersede one trace under a fresh revision.
 */
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ planId: string; phaseId: string; strokeId: string }>;
  },
) {
  const { planId, phaseId, strokeId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, mayDraw, governs } = outcome;

  if (!mayDraw) {
    return NextResponse.json(
      { error: "This plan is open to its leaders only" },
      { status: 403 },
    );
  }

  const refused = await refuseStroke(
    planId,
    phaseId,
    strokeId,
    caller.userId,
    governs,
    "A trace is only its author's to change",
  );

  if (refused) return refused;

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const body = parsed.body as
    | { points?: unknown; text?: unknown; restore?: unknown }
    | null;

  if (body?.restore === true) {
    const back = await restoreStroke(planId, strokeId);

    if ("refusal" in back) return refusal(back.refusal);

    return NextResponse.json({ stroke: back.stroke });
  }

  if (typeof body?.text === "string") {
    if (body.text.length > STROKE_TEXT_MAX_LENGTH) {
      return NextResponse.json(
        { error: `\`text\` exceeds ${STROKE_TEXT_MAX_LENGTH} characters` },
        { status: 400 },
      );
    }

    const named = await relabelStroke(planId, strokeId, body.text.trim());

    if ("refusal" in named) return refusal(named.refusal);

    return NextResponse.json({ stroke: named.stroke });
  }

  const points = body?.points;

  if (!Array.isArray(points) || points.length < 2 || points.length % 2 !== 0) {
    return NextResponse.json(
      { error: "`points` must be an even-length array of at least one pair" },
      { status: 400 },
    );
  }

  if (points.length > STROKE_MAX_POINTS * 2) {
    return NextResponse.json(
      { error: `\`points\` holds at most ${STROKE_MAX_POINTS} pairs` },
      { status: 400 },
    );
  }

  for (const value of points) {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > PLAN_GRID
    ) {
      return NextResponse.json(
        { error: `\`points\` must be integers between 0 and ${PLAN_GRID}` },
        { status: 400 },
      );
    }
  }

  const moved = await moveStroke(planId, strokeId, points as number[]);

  if ("refusal" in moved) return refusal(moved.refusal);

  return NextResponse.json({ stroke: moved.stroke });
}

/**
 * DELETE …/strokes/[strokeId]
 * Rubs one trace out.
 *
 * The tombstone takes a fresh revision, so a member who was away learns it is
 * gone on their next delta rather than keeping it on screen for ever.
 */
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ planId: string; phaseId: string; strokeId: string }>;
  },
) {
  const { planId, phaseId, strokeId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, mayDraw, governs } = outcome;

  if (!mayDraw) {
    return NextResponse.json(
      { error: "This plan is open to its leaders only" },
      { status: 403 },
    );
  }

  const refused = await refuseStroke(
    planId,
    phaseId,
    strokeId,
    caller.userId,
    governs,
    "The eraser only takes your own strokes",
  );

  if (refused) return refused;

  const erased = await eraseStroke(planId, strokeId);

  if ("refusal" in erased) return refusal(erased.refusal);

  return NextResponse.json({ stroke: erased.stroke });
}

/**
 * Whether this caller may touch this trace — `null` when they may.
 *
 * Two questions, and only the second one rank answers. **Which** trace is being
 * talked about is settled first and unconditionally: the record has to be the
 * one the URL names, in this plan *and* in this phase. The writes below look a
 * stroke up by `{planId, strokeId}` alone, so skipping this for whoever runs
 * the plan would let a wrong `phaseId` act on a trace in another phase and
 * quietly swallow the client bug that sent it.
 *
 * **Whose** it is comes second, and that is the one `governs` excuses: the
 * eraser takes your own, and whoever runs the plan takes anyone's. Read from
 * the database rather than trusted from the client, as everywhere else.
 */
async function refuseStroke(
  planId: string,
  phaseId: string,
  strokeId: string,
  userId: string,
  governs: boolean,
  mine: string,
): Promise<NextResponse | null> {
  const author = await strokeAuthor(planId, phaseId, strokeId);

  if (author === null) {
    return NextResponse.json({ error: "Stroke not found" }, { status: 404 });
  }

  if (!governs && author !== userId) {
    return NextResponse.json({ error: mine }, { status: 403 });
  }

  return null;
}

function refusal(kind: StrokeRefusal): NextResponse {
  if (kind === "locked") {
    return NextResponse.json({ error: "This phase is frozen" }, { status: 403 });
  }

  // A restore takes a slot back, so it can meet a phase that filled up while
  // the trace was gone — and «plein» must not be reported as «introuvable».
  if (kind === "full") {
    return NextResponse.json(
      { error: `A phase holds at most ${PHASE_MAX_STROKES} strokes` },
      { status: 409 },
    );
  }

  return NextResponse.json({ error: "Stroke not found" }, { status: 404 });
}
