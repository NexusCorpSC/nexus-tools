import { NextRequest, NextResponse } from "next/server";
import { eraseStroke, moveStroke, strokeAuthor } from "@/lib/plans";
import { PLAN_GRID, STROKE_MAX_POINTS } from "@/types/plan";
import { readBody } from "../../../../../../caller";
import { resolvePlan } from "../../../../../caller";

/**
 * One trace, rubbed out or moved.
 *
 * Both supersede it under a fresh revision rather than mutating it quietly —
 * that is what makes a removal and a move reach everybody the same way a
 * drawing does. Neither answers a `PlanView`: like the commit, they answer the
 * stroke, and the plan's own change rides the event stream.
 *
 * **The gomme only rubs out your own.** Whoever runs the plan may rub out
 * anyone's, and emptying a whole phase is `DELETE …/strokes`.
 */

/**
 * PATCH …/strokes/[strokeId]
 * Moves a trace — a token following the squad from one phase to the next,
 * mostly.
 *
 * Body: `{ points }`, on the same grid as a commit.
 */
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ planId: string; phaseId: string; strokeId: string }>;
  },
) {
  const { planId, strokeId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { mayDraw } = outcome;

  if (!mayDraw) {
    return NextResponse.json(
      { error: "This plan is open to its leaders only" },
      { status: 403 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const points = (parsed.body as { points?: unknown } | null)?.points;

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

  // Whose trace it is decides, and only whoever runs the plan is excused from
  // the question. Read before the write rather than trusted from the client.
  if (!governs) {
    const author = await strokeAuthor(planId, phaseId, strokeId);

    if (author === null) {
      return NextResponse.json({ error: "Stroke not found" }, { status: 404 });
    }

    if (author !== caller.userId) {
      return NextResponse.json(
        { error: "The eraser only takes your own strokes" },
        { status: 403 },
      );
    }
  }

  const erased = await eraseStroke(planId, strokeId);

  if ("refusal" in erased) return refusal(erased.refusal);

  return NextResponse.json({ stroke: erased.stroke });
}

function refusal(kind: "locked" | "full" | "gone"): NextResponse {
  if (kind === "locked") {
    return NextResponse.json({ error: "This phase is frozen" }, { status: 403 });
  }

  return NextResponse.json({ error: "Stroke not found" }, { status: 404 });
}
