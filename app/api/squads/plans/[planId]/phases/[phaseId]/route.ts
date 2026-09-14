import { NextRequest, NextResponse } from "next/server";
import { patchPhase, removePhase, type PhasePatch } from "@/lib/plans";
import {
  ASSIGNMENT_TASK_MAX_LENGTH,
  PHASE_ABORT_MAX_LENGTH,
  PHASE_MAX_DURATION_SEC,
  PHASE_MAX_POINTS,
  PHASE_NAME_MAX_LENGTH,
  PHASE_OBJECTIVE_MAX_LENGTH,
  PHASE_POINT_MAX_LENGTH,
  type PlanAssignment,
} from "@/types/plan";
import { readBody } from "../../../../caller";
import { planResponse, refuseRank, resolvePlan } from "../../../caller";

/**
 * One step of the plan: what it asks of the squad, in words, and whether it is
 * still open to the pen.
 *
 * The drawing is not here — it is at `…/strokes`. This is the brief: the
 * objective, the handful of things nobody may improvise on, when to give up,
 * how long it should take, and who does what.
 */

/**
 * PATCH /api/squads/plans/[planId]/phases/[phaseId]
 * Rewrites the brief, sets the duration, freezes the phase or thaws it.
 *
 * Body: `{ name?, objective?, points?, abort?, durationSec?, locked?,
 * assignments? }` — any subset; an absent field is left alone rather than
 * cleared.
 *
 * A frozen phase refuses strokes from everybody, rank included: a plan that has
 * been agreed should not get scribbled on ten minutes before the drop.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string; phaseId: string }> },
) {
  const { planId, phaseId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, governs } = outcome;

  if (!governs) return refuseRank(plan.scope, "rewrite a phase");

  if (!plan.phases.some((phase) => phase.id === phaseId)) {
    return NextResponse.json(
      { error: "No such phase in this plan" },
      { status: 404 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const body = parsed.body as Record<string, unknown> | null;
  const patch: PhasePatch = {};

  for (const [field, max] of [
    ["name", PHASE_NAME_MAX_LENGTH],
    ["objective", PHASE_OBJECTIVE_MAX_LENGTH],
    ["abort", PHASE_ABORT_MAX_LENGTH],
  ] as const) {
    const value = body?.[field];
    if (value === undefined) continue;

    if (typeof value !== "string") {
      return NextResponse.json(
        { error: `\`${field}\` must be a string` },
        { status: 400 },
      );
    }

    if (value.length > max) {
      return NextResponse.json(
        { error: `\`${field}\` exceeds ${max} characters` },
        { status: 400 },
      );
    }

    patch[field] = value.trim();
  }

  if (patch.name !== undefined && !patch.name) {
    return NextResponse.json(
      { error: "`name` must not be empty" },
      { status: 400 },
    );
  }

  if (body?.points !== undefined) {
    const points = body.points;

    if (
      !Array.isArray(points) ||
      points.some(
        (point) =>
          typeof point !== "string" || point.length > PHASE_POINT_MAX_LENGTH,
      )
    ) {
      return NextResponse.json(
        {
          error: `\`points\` must be an array of strings of at most ${PHASE_POINT_MAX_LENGTH} characters`,
        },
        { status: 400 },
      );
    }

    if (points.length > PHASE_MAX_POINTS) {
      return NextResponse.json(
        { error: `A phase holds at most ${PHASE_MAX_POINTS} points` },
        { status: 400 },
      );
    }

    patch.points = (points as string[])
      .map((point) => point.trim())
      .filter(Boolean);
  }

  if (body?.durationSec !== undefined) {
    const duration = body.durationSec;

    if (
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > PHASE_MAX_DURATION_SEC
    ) {
      return NextResponse.json(
        {
          error: `\`durationSec\` must be a number between 0 and ${PHASE_MAX_DURATION_SEC}`,
        },
        { status: 400 },
      );
    }

    patch.durationSec = Math.round(duration);
  }

  if (body?.locked !== undefined) {
    if (typeof body.locked !== "boolean") {
      return NextResponse.json(
        { error: "`locked` must be a boolean" },
        { status: 400 },
      );
    }

    patch.locked = body.locked;
  }

  if (body?.assignments !== undefined) {
    const read = readAssignments(body.assignments);
    if ("error" in read) {
      return NextResponse.json({ error: read.error }, { status: 400 });
    }

    patch.assignments = read.assignments;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      {
        error:
          "Nothing to update: pass `name`, `objective`, `points`, `abort`, `durationSec`, `locked` or `assignments`",
      },
      { status: 400 },
    );
  }

  const updated = await patchPhase(planId, phaseId, patch);

  if (!updated) {
    return NextResponse.json(
      { error: "No such phase in this plan" },
      { status: 404 },
    );
  }

  return planResponse(caller, squadId, updated);
}

/**
 * DELETE /api/squads/plans/[planId]/phases/[phaseId]
 * Takes a step out of the plan, with whatever was drawn on it.
 *
 * The last phase cannot go: a canvas with no phase has nowhere to draw.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string; phaseId: string }> },
) {
  const { planId, phaseId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, governs } = outcome;

  if (!governs) return refuseRank(plan.scope, "delete a phase");

  if (!plan.phases.some((phase) => phase.id === phaseId)) {
    return NextResponse.json(
      { error: "No such phase in this plan" },
      { status: 404 },
    );
  }

  if (plan.phases.length <= 1) {
    return NextResponse.json(
      { error: "A plan keeps at least one phase" },
      { status: 409 },
    );
  }

  const updated = await removePhase(planId, phaseId);

  if (!updated) {
    return NextResponse.json(
      { error: "A plan keeps at least one phase" },
      { status: 409 },
    );
  }

  return planResponse(caller, squadId, updated);
}

/** Who does what during this phase, as the panel writes it. */
function readAssignments(
  value: unknown,
): { assignments: PlanAssignment[] } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: "`assignments` must be an array" };
  }

  const assignments: PlanAssignment[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { error: "`assignments` must hold objects" };
    }

    const { userId, name, task } = entry as Record<string, unknown>;

    if (typeof userId !== "string" || !userId) {
      return { error: "`assignments[].userId` must be a non-empty string" };
    }

    if (typeof name !== "string" || typeof task !== "string") {
      return { error: "`assignments[].name` and `.task` must be strings" };
    }

    if (task.length > ASSIGNMENT_TASK_MAX_LENGTH) {
      return {
        error: `\`assignments[].task\` exceeds ${ASSIGNMENT_TASK_MAX_LENGTH} characters`,
      };
    }

    assignments.push({ userId, name: name.trim(), task: task.trim() });
  }

  return { assignments };
}
