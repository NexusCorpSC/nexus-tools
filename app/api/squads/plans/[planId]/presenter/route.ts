import { NextRequest, NextResponse } from "next/server";
import { setPresenter } from "@/lib/plans";
import { readBody } from "../../../caller";
import { planResponse, refuseRank, resolvePlan } from "../../caller";

/**
 * The briefing being walked through.
 *
 * One field on the plan, and everything else falls out of it: the presenter
 * names the phase they are on, the plan's version moves, and the stream puts
 * every open view on that phase. Stepping through four phases is four small
 * writes, no channel of its own.
 *
 * **«Reprendre la main» is not here, and never will be.** Following is a local
 * flag on each reader's screen: someone who takes back control is not changing
 * anything for anybody else, so there is nothing to write and nothing to tell
 * the others. A route for it would be a lie about what it does.
 *
 * A presenter who shuts their laptop leaves the field set. Whoever runs the
 * plan may clear it, and a client greys the badge once `startedAt` is old —
 * which is cheaper than a job that sweeps for one field.
 */

/**
 * PUT /api/squads/plans/[planId]/presenter
 * Starts the briefing, or moves it to another phase.
 *
 * Body: `{ phaseId }`.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, governs } = outcome;

  // Whoever runs the plan starts a briefing; whoever is running one may move it
  // on, so a lead who handed over does not have to be asked to press next.
  const running = plan.presenter?.userId === caller.userId;

  if (!governs && !running) {
    return refuseRank(plan.scope, "lead the briefing");
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const phaseId = (parsed.body as { phaseId?: unknown } | null)?.phaseId;

  if (typeof phaseId !== "string" || !phaseId) {
    return NextResponse.json(
      { error: "`phaseId` must be a non-empty string" },
      { status: 400 },
    );
  }

  if (!plan.phases.some((phase) => phase.id === phaseId)) {
    return NextResponse.json(
      { error: "No such phase in this plan" },
      { status: 404 },
    );
  }

  const updated = await setPresenter(planId, {
    userId: caller.userId,
    name: caller.name,
    phaseId,
    // Stamped afresh on every step, so «is this briefing still live» is one
    // comparison rather than a guess about how long four phases ought to take.
    startedAt: new Date().toISOString(),
  });

  if (!updated) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return planResponse(caller, squadId, updated);
}

/**
 * DELETE /api/squads/plans/[planId]/presenter
 * Ends the briefing. Everyone keeps whatever phase they were looking at.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, governs } = outcome;

  const running = plan.presenter?.userId === caller.userId;

  if (!governs && !running) {
    return refuseRank(plan.scope, "end the briefing");
  }

  const updated = await setPresenter(planId, null);

  if (!updated) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return planResponse(caller, squadId, updated);
}
