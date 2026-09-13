import { NextRequest, NextResponse } from "next/server";
import { clearPhase, commitStroke, strokesSince, type StrokeDraft } from "@/lib/plans";
import {
  isPlanInk,
  isStrokeKind,
  isStrokeWidth,
  PHASE_MAX_STROKES,
  PLAN_GRID,
  STROKE_MAX_POINTS,
  STROKE_TEXT_MAX_LENGTH,
  type StrokeDelta,
} from "@/types/plan";
import { readBody } from "../../../../../caller";
import { planResponse, refuseRank, resolvePlan } from "../../../../caller";

/**
 * What is drawn on one phase.
 *
 * The busiest route in the product, and the only one that does not answer a
 * `PlanView`: a stroke is pulled and pushed by delta, not as part of a whole
 * view. `planStrokes` is invisible to the event stream by design — see the note
 * at the top of `lib/plans.ts` — so what reaches the other members is the
 * revision this route allocates on the plan, and they come back here for the
 * trace itself.
 */

/**
 * GET …/strokes?since=<rev>&epoch=<epoch>
 * Everything drawn above a revision.
 *
 * **`since` is what the caller was handed, never what the feed announced.** A
 * revision is published an instant before the stroke carrying it is inserted,
 * so a client that trusted the feed would step over the one stroke still in
 * flight. Taking the highest revision actually received makes that impossible:
 * the missing stroke is simply not in the answer, the cursor does not move past
 * it, and the next call brings it.
 *
 * An `epoch` that no longer matches answers **409** with the current one: the
 * phase was emptied, so what the caller holds is gone and it should ask again
 * from zero. A phase that no longer exists answers **404** — never an empty
 * 200, which would read as «you are up to date».
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string; phaseId: string }> },
) {
  const { planId, phaseId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { plan } = outcome;

  const phase = plan.phases.find((candidate) => candidate.id === phaseId);

  if (!phase) {
    return NextResponse.json(
      { error: "No such phase in this plan" },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? "0");
  const asked = url.searchParams.get("epoch");

  if (!Number.isFinite(since) || since < 0) {
    return NextResponse.json(
      { error: "`since` must be a non-negative number" },
      { status: 400 },
    );
  }

  if (asked !== null && Number(asked) !== phase.epoch) {
    return NextResponse.json(
      {
        error: "This phase was cleared — ask again from zero",
        epoch: phase.epoch,
        rev: phase.rev,
      },
      { status: 409 },
    );
  }

  const delta: StrokeDelta = {
    phaseId,
    epoch: phase.epoch,
    rev: phase.rev,
    strokes: await strokesSince(planId, phaseId, phase.epoch, Math.floor(since)),
  };

  return NextResponse.json(delta);
}

/**
 * POST …/strokes
 * Commits one trace, at the pen's lift.
 *
 * Body: the stroke minus everything the server knows better — the author, the
 * revision and the epoch are not the client's to state. `clientId` is: it is
 * minted before the request so that a commit retried after a timeout is
 * recognised and handed back rather than drawn twice.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string; phaseId: string }> },
) {
  const { planId, phaseId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, mayDraw } = outcome;

  if (!mayDraw) {
    return NextResponse.json(
      { error: "This plan is open to its leaders only" },
      { status: 403 },
    );
  }

  const phase = plan.phases.find((candidate) => candidate.id === phaseId);

  if (!phase) {
    return NextResponse.json(
      { error: "No such phase in this plan" },
      { status: 404 },
    );
  }

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const read = readDraft(parsed.body, caller.userId, caller.name, squadId);
  if ("error" in read) {
    return NextResponse.json({ error: read.error }, { status: 400 });
  }

  const committed = await commitStroke(planId, phaseId, read.draft);

  if ("refusal" in committed) {
    if (committed.refusal === "locked") {
      return NextResponse.json(
        { error: "This phase is frozen" },
        { status: 403 },
      );
    }

    if (committed.refusal === "full") {
      return NextResponse.json(
        { error: `A phase holds at most ${PHASE_MAX_STROKES} strokes` },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "No such phase in this plan" },
      { status: 404 },
    );
  }

  return NextResponse.json({ stroke: committed.stroke }, { status: 201 });
}

/**
 * DELETE …/strokes
 * Empties the phase.
 *
 * The epoch moves and the strokes go — no tombstone storm. A client whose epoch
 * differs throws its layer away and asks again from zero, which is how a member
 * who was away learns that four hundred traces are gone.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string; phaseId: string }> },
) {
  const { planId, phaseId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, governs } = outcome;

  if (!governs) return refuseRank(plan.scope, "empty a phase");

  if (!plan.phases.some((candidate) => candidate.id === phaseId)) {
    return NextResponse.json(
      { error: "No such phase in this plan" },
      { status: 404 },
    );
  }

  const updated = await clearPhase(planId, phaseId);

  if (!updated) {
    return NextResponse.json(
      { error: "This phase is frozen" },
      { status: 403 },
    );
  }

  return planResponse(caller, squadId, updated);
}

/**
 * The stroke a client may state.
 *
 * Coordinates are integers on the plan's own grid: a plan drawn on a desktop
 * and read on a phone is the same plan. Anything outside it is refused rather
 * than clamped — a client sending them has a bug, and silently moving somebody
 * else's trace is worse than telling them.
 */
function readDraft(
  body: unknown,
  authorId: string,
  authorName: string,
  squadId: string,
): { draft: StrokeDraft } | { error: string } {
  const fields = body as Record<string, unknown> | null;

  const clientId = fields?.clientId;
  if (
    typeof clientId !== "string" ||
    !/^[A-Za-z0-9_-]{6,64}$/.test(clientId)
  ) {
    return { error: "`clientId` must be 6 to 64 url-safe characters" };
  }

  const { kind, ink, width, points } = fields ?? {};

  if (!isStrokeKind(kind)) {
    return { error: "`kind` must be one of the known stroke kinds" };
  }

  if (!isPlanInk(ink)) {
    return { error: "`ink` must be one of the known inks" };
  }

  if (!isStrokeWidth(width)) {
    return { error: "`width` must be one of the known widths" };
  }

  if (!Array.isArray(points) || points.length < 2 || points.length % 2 !== 0) {
    return { error: "`points` must be an even-length array of at least one pair" };
  }

  if (points.length > STROKE_MAX_POINTS * 2) {
    return { error: `\`points\` holds at most ${STROKE_MAX_POINTS} pairs` };
  }

  for (const value of points) {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > PLAN_GRID
    ) {
      return { error: `\`points\` must be integers between 0 and ${PLAN_GRID}` };
    }
  }

  const text = fields?.text;
  if (text !== undefined && typeof text !== "string") {
    return { error: "`text` must be a string" };
  }

  if (typeof text === "string" && text.length > STROKE_TEXT_MAX_LENGTH) {
    return { error: `\`text\` exceeds ${STROKE_TEXT_MAX_LENGTH} characters` };
  }

  const tokenUserId = fields?.tokenUserId;
  if (tokenUserId !== undefined && typeof tokenUserId !== "string") {
    return { error: "`tokenUserId` must be a string" };
  }

  // A text with nothing in it draws nothing and cannot be selected to fix.
  if ((kind === "text" || kind === "pin") && !(text as string | undefined)?.trim()) {
    return { error: "`text` must not be empty for this kind" };
  }

  return {
    draft: {
      clientId,
      authorId,
      authorName,
      squadId,
      kind,
      ink,
      width,
      points: points as number[],
      text: typeof text === "string" ? text.trim() : "",
      tokenUserId: typeof tokenUserId === "string" ? tokenUserId : "",
    },
  };
}
