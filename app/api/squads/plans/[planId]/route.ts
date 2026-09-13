import { NextRequest, NextResponse } from "next/server";
import { deletePlan, patchPlan, type PlanPatch } from "@/lib/plans";
import { isDrawPolicy, PLAN_NAME_MAX_LENGTH } from "@/types/plan";
import { readBody, readString } from "../../caller";
import { planResponse, refuseRank, resolvePlan } from "../caller";

/**
 * One plan de vol.
 *
 * The strokes are not here: they are pulled by delta from
 * `…/phases/[phaseId]/strokes`, against the revisions the feed carries. What
 * this route answers is the plan as it reads — the phases, their briefs, the
 * background, who may draw.
 */

/**
 * GET /api/squads/plans/[planId]
 * The plan in full, texts included.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan } = outcome;

  return planResponse(caller, squadId, plan);
}

/**
 * PATCH /api/squads/plans/[planId]
 * Renames the plan, sets its background, opens or closes it to the whole raid,
 * archives it or brings it back.
 *
 * Body: `{ name?, drawPolicy?, background?, archived? }` — any subset; an absent
 * field is left alone rather than cleared. `background: null` takes the image
 * off and leaves the grid.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, governs } = outcome;

  if (!governs) return refuseRank(plan.scope, "change the plan");

  const parsed = await readBody(request);
  if ("refused" in parsed) return parsed.refused;

  const body = parsed.body as Record<string, unknown> | null;
  const patch: PlanPatch = {};

  if (body?.name !== undefined) {
    const field = readString(body, "name", PLAN_NAME_MAX_LENGTH);
    if ("error" in field) {
      return NextResponse.json({ error: field.error }, { status: 400 });
    }

    const name = field.value.trim();
    if (!name) {
      return NextResponse.json(
        { error: "`name` must not be empty" },
        { status: 400 },
      );
    }

    patch.name = name;
  }

  if (body?.drawPolicy !== undefined) {
    if (!isDrawPolicy(body.drawPolicy)) {
      return NextResponse.json(
        { error: "`drawPolicy` must be `all` or `leaders`" },
        { status: 400 },
      );
    }

    patch.drawPolicy = body.drawPolicy;
  }

  if (body?.archived !== undefined) {
    if (typeof body.archived !== "boolean") {
      return NextResponse.json(
        { error: "`archived` must be a boolean" },
        { status: 400 },
      );
    }

    patch.archived = body.archived;
  }

  if (body?.background !== undefined) {
    const read = readBackground(body.background);
    if ("error" in read) {
      return NextResponse.json({ error: read.error }, { status: 400 });
    }

    patch.background = read.background;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      {
        error:
          "Nothing to update: pass `name`, `drawPolicy`, `background` or `archived`",
      },
      { status: 400 },
    );
  }

  const updated = await patchPlan(planId, patch);

  if (!updated) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return planResponse(caller, squadId, updated);
}

/**
 * DELETE /api/squads/plans/[planId]
 * Throws the plan away, strokes and all.
 *
 * Archiving is the usual answer — this is for a plan that was a mistake, or for
 * making room once the shelf is full.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;

  const outcome = await resolvePlan(request, planId);
  if ("refused" in outcome) return outcome.refused;

  const { caller, squadId, plan, governs } = outcome;

  if (!governs) return refuseRank(plan.scope, "delete the plan");

  await deletePlan(planId);

  return planResponse(caller, squadId, null);
}

/**
 * The background, as the client reports it after the upload.
 *
 * The URL is whatever the blob store answered; the size comes with it because
 * the canvas frames the image before it has loaded, and a frame that resizes
 * under a drawing moves every trace on it.
 */
function readBackground(
  value: unknown,
): { background: PlanPatch["background"] } | { error: string } {
  if (value === null) return { background: null };

  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "`background` must be an object or null" };
  }

  const { url, width, height } = value as Record<string, unknown>;

  if (typeof url !== "string" || !url) {
    return { error: "`background.url` must be a non-empty string" };
  }

  // Only ever the store this deployment uploads to: a plan is drawn by one
  // member and read by twenty, and an arbitrary URL here would let the first
  // point the other nineteen anywhere.
  if (!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url)) {
    return { error: "`background.url` must be an uploaded image" };
  }

  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { error: "`background.width` and `background.height` must be positive numbers" };
  }

  return {
    background: {
      url,
      width: Math.round(width),
      height: Math.round(height),
    },
  };
}
