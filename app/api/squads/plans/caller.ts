import { NextResponse } from "next/server";
import {
  getPlan,
  governsPlan,
  mayDrawOn,
  planFeedFor,
  type PlanScopeRef,
} from "@/lib/plans";
import type { Plan, PlanView } from "@/types/plan";
import { resolveRaid, type Caller } from "../caller";

/**
 * The three things every plan route starts by establishing: who is asking,
 * which plan they mean, and what their rank lets them do to it.
 *
 * Built on `resolveRaid` rather than beside it, because a plan's rank *is* the
 * squad's: a raid's plan answers to whoever commands its lead squad, a squad's
 * plan to whoever commands the squad, and `commandsSquad` has already refused
 * to tell a leader from a lieutenant. Nothing here starts to.
 *
 * A plan is never reached by id alone. The caller's squad comes from the
 * session (or from `?squad=<id>`, for the organiser who is in several), and a
 * plan whose owner is not that squad — or the raid it is in — answers 404
 * rather than 403: whether it exists is not the asker's business.
 */

function refuse(error: string, status: number) {
  return { refused: NextResponse.json({ error }, { status }) };
}

export interface PlanStanding {
  caller: Caller;
  /** The caller's squad — the one whose colours their strokes wear. */
  squadId: string;
  plan: Plan;
  /** Whoever runs this plan: commands the squad, or leads the raid. */
  governs: boolean;
  /** Whoever may put a trace on it, which `drawPolicy` may widen. */
  mayDraw: boolean;
}

export async function resolvePlan(
  request: Request,
  planId: string,
): Promise<{ refused: NextResponse } | PlanStanding> {
  const outcome = await resolveRaid(request);
  if ("refused" in outcome) return outcome;

  const { caller, squad, raid, commands, leads } = outcome;

  const plan = await getPlan(planId);
  if (!plan) return refuse("Plan not found", 404);

  const belongs =
    plan.scope === "raid"
      ? raid?.id === plan.ownerId
      : squad.id === plan.ownerId;

  if (!belongs) return refuse("Plan not found", 404);

  return {
    caller,
    squadId: squad.id,
    plan,
    governs: governsPlan(plan, { commands, leads }),
    mayDraw: mayDrawOn(plan, { commands, leads }),
  };
}

export interface ScopeStanding {
  caller: Caller;
  ref: PlanScopeRef;
  governs: boolean;
}

/**
 * Where the caller's plans live, for the two routes that name none: the list
 * and the creation.
 *
 * The scope is derived from the squad the request already resolved rather than
 * read again — a squad in a raid briefs with the raid, one running alone briefs
 * on its own.
 */
export async function resolveScope(
  request: Request,
): Promise<{ refused: NextResponse } | ScopeStanding> {
  const outcome = await resolveRaid(request);
  if ("refused" in outcome) return outcome;

  const { caller, squad, raid, commands, leads } = outcome;

  const ref: PlanScopeRef = raid
    ? { scope: "raid", ownerId: raid.id, squadId: squad.id }
    : { scope: "squad", ownerId: squad.id, squadId: squad.id };

  return {
    caller,
    ref,
    governs: ref.scope === "raid" ? leads : commands,
  };
}

/* ------------------------------------------------------------------ */
/* Answering                                                           */
/* ------------------------------------------------------------------ */

/**
 * What every plan route answers with: where the caller stands, whole.
 *
 * The feed always, so a client never has to ask twice to learn a plan was
 * renamed or archived, and `plan` as the route left it rather than re-read, so
 * the answer reflects the write that was just made. The same contract the squad
 * routes hold to, and what lets a click show its own result without waiting for
 * the stream.
 *
 * The strokes are **not** in it: they are pulled by delta, against the phase
 * revisions the feed carries. See `types/plan.ts`.
 */
export async function planView(
  caller: Caller,
  squadId: string,
  plan: Plan | null,
): Promise<PlanView> {
  return { feed: await planFeedFor(caller.userId, squadId), plan };
}

export async function planResponse(
  caller: Caller,
  squadId: string,
  plan: Plan | null,
  init?: ResponseInit,
): Promise<NextResponse> {
  return NextResponse.json(await planView(caller, squadId, plan), init);
}

/** The refusal a rank check produces, worded for the scope it happened in. */
export function refuseRank(scope: Plan["scope"], verb: string): NextResponse {
  return NextResponse.json(
    {
      error:
        scope === "raid"
          ? `Only the lead squad's leader or a lieutenant may ${verb}`
          : `Only the squad leader or a lieutenant may ${verb}`,
    },
    { status: 403 },
  );
}
