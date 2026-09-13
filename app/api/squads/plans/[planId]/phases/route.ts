import { NextRequest, NextResponse } from "next/server";
import { addPhase, reorderPhases } from "@/lib/plans";
import { PHASE_NAME_MAX_LENGTH, PLAN_MAX_PHASES } from "@/types/plan";
import { readBody } from "../../../caller";
import { planResponse, refuseRank, resolvePlan } from "../../caller";

/**
 * The steps of the plan.
 *
 * A phase is a layer of strokes over the plan's common background, and the
 * order of the phases is the order of the operation. Adding one copies the
 * strokes of the phase it follows by default — a plan is built by drawing the
 * next step on top of the last, not from a blank frame every time.
 */

/**
 * POST /api/squads/plans/[planId]/phases
 * Adds a phase at the end.
 *
 * Body: `{ name?, after? }`. `after` is the id of the phase whose drawing to
 * carry over; absent, the new phase starts empty.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, governs } = outcome;

  if (!governs) return refuseRank(plan.scope, "add a phase");

  if (plan.phases.length >= PLAN_MAX_PHASES) {
    return NextResponse.json(
      { error: `A plan holds at most ${PLAN_MAX_PHASES} phases` },
      { status: 409 },
    );
  }

  const raw = (await request.text()).trim();
  let body: Record<string, unknown> = {};

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "Body must be an object" },
          { status: 400 },
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }
  }

  const name = body.name;
  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json(
      { error: "`name` must be a string" },
      { status: 400 },
    );
  }

  if (typeof name === "string" && name.length > PHASE_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { error: `\`name\` exceeds ${PHASE_NAME_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  const after = body.after;
  if (after !== undefined && typeof after !== "string") {
    return NextResponse.json(
      { error: "`after` must be a string" },
      { status: 400 },
    );
  }

  if (
    typeof after === "string" &&
    !plan.phases.some((phase) => phase.id === after)
  ) {
    return NextResponse.json(
      { error: "No such phase in this plan" },
      { status: 404 },
    );
  }

  const label =
    (typeof name === "string" ? name.trim() : "") ||
    `Phase ${plan.phases.length + 1}`;

  const updated = await addPhase(
    planId,
    label,
    typeof after === "string" ? after : null,
  );

  if (!updated) {
    return NextResponse.json(
      { error: `A plan holds at most ${PLAN_MAX_PHASES} phases` },
      { status: 409 },
    );
  }

  return planResponse(caller, squadId, updated, { status: 201 });
}

/**
 * PATCH /api/squads/plans/[planId]/phases
 * Reorders them.
 *
 * Body: `{ order: string[] }`. A phase the list does not name keeps its place
 * at the end rather than being dropped, so a phase added between the client's
 * read and its write survives.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, governs } = outcome;

  if (!governs) return refuseRank(plan.scope, "reorder the phases");

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const order = (parsed.body as { order?: unknown } | null)?.order;

  if (
    !Array.isArray(order) ||
    order.some((id) => typeof id !== "string") ||
    order.length === 0
  ) {
    return NextResponse.json(
      { error: "`order` must be a non-empty array of phase ids" },
      { status: 400 },
    );
  }

  const updated = await reorderPhases(planId, order as string[]);

  if (!updated) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return planResponse(caller, squadId, updated);
}
