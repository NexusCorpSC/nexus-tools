import "server-only";
import { ObjectId, type Filter } from "mongodb";
import db from "@/lib/db";
import { newCode } from "@/lib/join-codes";
import type { DbSquad } from "@/lib/squads";
import {
  PHASE_MAX_STROKES,
  PLAN_MAX_ACTIVE_PER_OWNER,
  PLAN_MAX_PER_OWNER,
  PLAN_MAX_PHASES,
  inPlanOrder,
  type DrawPolicy,
  type Plan,
  type PlanAssignment,
  type PlanFeed,
  type PlanInk,
  type PlanPhase,
  type PlanPhaseSummary,
  type PlanPresenter,
  type PlanScope,
  type PlanStroke,
  type PlanSummary,
  type StrokeKind,
} from "@/types/plan";

/**
 * Plans de vol, and the strokes drawn on them.
 *
 * **The one rule.** `planStrokes` is deliberately *not* among the collections
 * the event hub watches (`lib/events/plan.ts` lists `["plans"]` alone), because
 * it is the highest-frequency collection in the product and the hub re-reads a
 * topic's view once per connected member on every change it sees. Strokes are
 * therefore invisible to the stream, and:
 *
 * > every write to `planStrokes` must be accompanied, in the same request, by a
 * > write to `plans` that changes the pushed view.
 *
 * That is what `allocateRev` is for, and it is the single rule that — broken —
 * stops live synchronisation with no error anywhere. Every function here that
 * touches a stroke goes through it.
 *
 * The counter it allocates is published an instant *before* the stroke carrying
 * it exists. That is the safe direction: a client's cursor is the highest
 * revision it was actually handed, never the one the feed announces, so a
 * stroke still in flight is simply fetched on the next pass. See
 * `PlanPhase.rev`.
 */

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

interface DbPhase {
  id: string;
  name: string;
  objective: string;
  points: string[];
  abort: string;
  durationSec: number;
  locked: boolean;
  assignments?: PlanAssignment[];
  rev: number;
  epoch: number;
  strokes: number;
}

export interface DbPlan {
  _id: ObjectId;
  scope: PlanScope;
  /** A squad id or a raid id. The field the change stream routes on. */
  ownerId: string;
  createdBy: string;
  name: string;
  backgroundUrl?: string | null;
  backgroundW?: number;
  backgroundH?: number;
  drawPolicy: DrawPolicy;
  presenter?: PlanPresenter | null;
  /** Stored in plan order; `order` is the array index. */
  phases: DbPhase[];
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface DbPlanStroke {
  _id: ObjectId;
  planId: string;
  phaseId: string;
  epoch: number;
  rev: number;
  clientId: string;
  authorId: string;
  authorName: string;
  squadId: string;
  kind: StrokeKind;
  ink: PlanInk;
  width: number;
  points: number[];
  text?: string;
  tokenUserId?: string;
  createdAt: string;
  deletedAt?: string | null;
}

function plans() {
  return db.db().collection<DbPlan>("plans");
}

function strokes() {
  return db.db().collection<DbPlanStroke>("planStrokes");
}

/** A phase id, told apart from a role's `r…` at a glance in a log. */
function newPhaseId(): string {
  return `p${newCode()}`;
}

/** A duplicate key, whichever index raised it. */
function isDuplicate(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

/**
 * One place absorbs what older documents are missing, as `toSquad` does: a plan
 * written before assignments existed has no `assignments`, and reading `?? []`
 * here is cheaper than teaching every caller about it.
 */
function toPhase(phase: DbPhase, order: number): PlanPhase {
  return {
    id: phase.id,
    order,
    name: phase.name,
    objective: phase.objective ?? "",
    points: phase.points ?? [],
    abort: phase.abort ?? "",
    durationSec: phase.durationSec ?? 0,
    locked: phase.locked ?? false,
    assignments: phase.assignments ?? [],
    rev: phase.rev ?? 0,
    epoch: phase.epoch ?? 0,
    strokes: phase.strokes ?? 0,
  };
}

function toPhaseSummary(phase: DbPhase, order: number): PlanPhaseSummary {
  return {
    id: phase.id,
    order,
    name: phase.name,
    durationSec: phase.durationSec ?? 0,
    locked: phase.locked ?? false,
    rev: phase.rev ?? 0,
    epoch: phase.epoch ?? 0,
    strokes: phase.strokes ?? 0,
  };
}

export function toSummary(doc: DbPlan): PlanSummary {
  return {
    id: doc._id.toString(),
    scope: doc.scope,
    ownerId: doc.ownerId,
    name: doc.name,
    backgroundUrl: doc.backgroundUrl ?? null,
    backgroundW: doc.backgroundW ?? 0,
    backgroundH: doc.backgroundH ?? 0,
    drawPolicy: doc.drawPolicy ?? "all",
    presenter: doc.presenter ?? null,
    archivedAt: doc.archivedAt ?? null,
    version: doc.version ?? 0,
    updatedAt: doc.updatedAt,
    phases: doc.phases.map(toPhaseSummary),
  };
}

export function toPlan(doc: DbPlan): Plan {
  return { ...toSummary(doc), phases: doc.phases.map(toPhase) };
}

export function toStroke(doc: DbPlanStroke): PlanStroke {
  return {
    id: doc._id.toString(),
    phaseId: doc.phaseId,
    epoch: doc.epoch,
    rev: doc.rev,
    clientId: doc.clientId,
    authorId: doc.authorId,
    authorName: doc.authorName,
    squadId: doc.squadId ?? "",
    kind: doc.kind,
    ink: doc.ink,
    width: doc.width,
    points: doc.points ?? [],
    text: doc.text ?? "",
    tokenUserId: doc.tokenUserId ?? "",
    deletedAt: doc.deletedAt ?? null,
    createdAt: doc.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Scope                                                               */
/* ------------------------------------------------------------------ */

/** Which squad or raid a reader's plans belong to. */
export interface PlanScopeRef {
  scope: PlanScope;
  ownerId: string;
  /** The squad that put them there, whichever scope won. */
  squadId: string;
}

/**
 * Where a reader stands, read as cheaply as it can be.
 *
 * A squad in a raid briefs with the raid; one running alone briefs on its own —
 * the same bascule the squad board offers between the two rosters. A raid's
 * organiser is in several squads, and `squadId` picks which one is meant, the
 * longest-standing one standing in when it names none.
 *
 * Deliberately not `getSquadsForUser`: this runs once per connected member on
 * every stroke, so it reads three fields and no roster.
 */
export async function planScopeOf(
  userId: string,
  squadId: string | null,
): Promise<PlanScopeRef | null> {
  const squads = await db
    .db()
    .collection<DbSquad>("squads")
    .find(
      { "members.userId": userId },
      { projection: { _id: 1, raidId: 1, createdAt: 1 } },
    )
    .sort({ createdAt: 1 })
    .toArray();

  if (squads.length === 0) return null;

  const named = squadId
    ? squads.find((squad) => squad._id.toString() === squadId)
    : undefined;

  const squad = named ?? squads[0];
  const id = squad._id.toString();

  return squad.raidId
    ? { scope: "raid", ownerId: squad.raidId, squadId: id }
    : { scope: "squad", ownerId: id, squadId: id };
}

/**
 * The feed one reader sees: every live plan of their scope.
 *
 * **Never throws.** A throw here is swallowed by the hub with a warning and the
 * reader silently never gets a snapshot again; a reader in no squad simply has
 * no plans, which is a perfectly good answer.
 */
export async function planFeedFor(
  userId: string,
  squadId: string | null,
): Promise<PlanFeed> {
  try {
    const ref = await planScopeOf(userId, squadId);
    if (!ref) return { scope: "squad", ownerId: null, plans: [] };

    const docs = await plans()
      .find({ ownerId: ref.ownerId, archivedAt: { $in: [null, undefined] } })
      .sort({ updatedAt: -1 })
      .limit(PLAN_MAX_ACTIVE_PER_OWNER)
      .toArray();

    return {
      scope: ref.scope,
      ownerId: ref.ownerId,
      plans: docs.map(toSummary),
    };
  } catch {
    return { scope: "squad", ownerId: null, plans: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export async function getPlan(planId: string): Promise<Plan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const doc = await plans().findOne({ _id: new ObjectId(planId) });

  return doc ? toPlan(doc) : null;
}

/** Every plan of a scope, archived ones included — the «repartir d'un plan» list. */
export async function getPlansOfOwner(ownerId: string): Promise<PlanSummary[]> {
  const docs = await plans()
    .find({ ownerId })
    .sort({ updatedAt: -1 })
    .limit(PLAN_MAX_PER_OWNER)
    .toArray();

  return docs.map(toSummary);
}

/* ------------------------------------------------------------------ */
/* Writing the plan                                                    */
/* ------------------------------------------------------------------ */

function freshPhase(name: string): DbPhase {
  return {
    id: newPhaseId(),
    name,
    objective: "",
    points: [],
    abort: "",
    durationSec: 0,
    locked: false,
    assignments: [],
    rev: 0,
    epoch: 0,
    strokes: 0,
  };
}

export type PlanRefusal = "full" | "archived-full";

export async function createPlan(
  ref: PlanScopeRef,
  createdBy: string,
  name: string,
  firstPhaseName: string,
): Promise<{ plan: Plan } | { refusal: PlanRefusal }> {
  const [active, total] = await Promise.all([
    plans().countDocuments({
      ownerId: ref.ownerId,
      archivedAt: { $in: [null, undefined] },
    }),
    plans().countDocuments({ ownerId: ref.ownerId }),
  ]);

  if (active >= PLAN_MAX_ACTIVE_PER_OWNER) return { refusal: "full" };
  if (total >= PLAN_MAX_PER_OWNER) return { refusal: "archived-full" };

  const now = new Date().toISOString();

  const doc: DbPlan = {
    _id: new ObjectId(),
    scope: ref.scope,
    ownerId: ref.ownerId,
    createdBy,
    name,
    backgroundUrl: null,
    backgroundW: 0,
    backgroundH: 0,
    drawPolicy: "all",
    presenter: null,
    phases: [freshPhase(firstPhaseName)],
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };

  await plans().insertOne(doc);

  return { plan: toPlan(doc) };
}

/**
 * A plan the squad already drew, as a starting point.
 *
 * The strokes come along — that is the whole point of «repartir d'un plan» — so
 * each phase keeps its drawing but restarts its counters: the copy's readers
 * have never seen any of it, and epoch zero is what a client starting from
 * nothing expects.
 */
export async function duplicatePlan(
  source: Plan,
  ref: PlanScopeRef,
  createdBy: string,
  name: string,
): Promise<{ plan: Plan } | { refusal: PlanRefusal }> {
  const active = await plans().countDocuments({
    ownerId: ref.ownerId,
    archivedAt: { $in: [null, undefined] },
  });

  if (active >= PLAN_MAX_ACTIVE_PER_OWNER) return { refusal: "full" };

  const now = new Date().toISOString();
  const planId = new ObjectId();

  /** The copy's phase ids are fresh, and the strokes follow them across. */
  const rewritten = new Map<string, string>();

  const phases: DbPhase[] = inPlanOrder(
    source.phases.map((phase, order) => ({ ...phase, order })),
  ).map((phase) => {
    const id = newPhaseId();
    rewritten.set(phase.id, id);

    return {
      id,
      name: phase.name,
      objective: phase.objective,
      points: phase.points,
      abort: phase.abort,
      durationSec: phase.durationSec,
      locked: false,
      assignments: phase.assignments,
      rev: 0,
      epoch: 0,
      strokes: 0,
    };
  });

  await plans().insertOne({
    _id: planId,
    scope: ref.scope,
    ownerId: ref.ownerId,
    createdBy,
    name,
    backgroundUrl: source.backgroundUrl,
    backgroundW: source.backgroundW,
    backgroundH: source.backgroundH,
    drawPolicy: source.drawPolicy,
    presenter: null,
    phases,
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });

  for (const [from, to] of rewritten) {
    const copied = await strokes()
      .find({
        planId: source.id,
        phaseId: from,
        deletedAt: { $in: [null, undefined] },
      })
      .sort({ rev: 1 })
      .limit(PHASE_MAX_STROKES)
      .toArray();

    if (copied.length === 0) continue;

    await strokes().insertMany(
      copied.map((stroke, index) => ({
        ...stroke,
        _id: new ObjectId(),
        planId: planId.toString(),
        phaseId: to,
        epoch: 0,
        rev: index + 1,
        clientId: `copy-${newCode()}`,
        createdAt: now,
        deletedAt: null,
      })),
    );

    await plans().updateOne(
      { _id: planId, "phases.id": to },
      {
        $set: {
          "phases.$.rev": copied.length,
          "phases.$.strokes": copied.length,
        },
      },
    );
  }

  const doc = await plans().findOne({ _id: planId });

  return doc ? { plan: toPlan(doc) } : { refusal: "full" };
}

export interface PlanPatch {
  name?: string;
  drawPolicy?: DrawPolicy;
  background?: { url: string; width: number; height: number } | null;
  archived?: boolean;
}

export async function patchPlan(
  planId: string,
  patch: PlanPatch,
): Promise<Plan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (patch.name !== undefined) set.name = patch.name;
  if (patch.drawPolicy !== undefined) set.drawPolicy = patch.drawPolicy;

  if (patch.background !== undefined) {
    set.backgroundUrl = patch.background?.url ?? null;
    set.backgroundW = patch.background?.width ?? 0;
    set.backgroundH = patch.background?.height ?? 0;
  }

  if (patch.archived !== undefined) {
    set.archivedAt = patch.archived ? new Date().toISOString() : null;
    // An archived plan stops leading a briefing it is no longer part of.
    if (patch.archived) set.presenter = null;
  }

  const updated = await plans().findOneAndUpdate(
    { _id: new ObjectId(planId) },
    { $set: set, $inc: { version: 1 } },
    { returnDocument: "after" },
  );

  return updated ? toPlan(updated) : null;
}

export async function deletePlan(planId: string): Promise<boolean> {
  if (!ObjectId.isValid(planId)) return false;

  const gone = await plans().deleteOne({ _id: new ObjectId(planId) });
  if (gone.deletedCount === 0) return false;

  await strokes().deleteMany({ planId });

  return true;
}

/* ------------------------------------------------------------------ */
/* Phases                                                              */
/* ------------------------------------------------------------------ */

/**
 * A phase at the end of the plan.
 *
 * `after` copies the strokes of the phase it follows, which is what the «+»
 * button in the strip does: a plan is built by drawing the next step on top of
 * the last one, not from a blank frame every time.
 */
export async function addPhase(
  planId: string,
  name: string,
  after: string | null,
): Promise<Plan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const phase = freshPhase(name);
  const now = new Date().toISOString();

  const updated = await plans().findOneAndUpdate(
    {
      _id: new ObjectId(planId),
      [`phases.${PLAN_MAX_PHASES - 1}`]: { $exists: false },
    },
    { $push: { phases: phase }, $set: { updatedAt: now }, $inc: { version: 1 } },
    { returnDocument: "after" },
  );

  if (!updated) return null;

  if (after) {
    const copied = await strokes()
      .find({
        planId,
        phaseId: after,
        deletedAt: { $in: [null, undefined] },
      })
      .sort({ rev: 1 })
      .limit(PHASE_MAX_STROKES)
      .toArray();

    if (copied.length > 0) {
      await strokes().insertMany(
        copied.map((stroke, index) => ({
          ...stroke,
          _id: new ObjectId(),
          phaseId: phase.id,
          epoch: 0,
          rev: index + 1,
          clientId: `copy-${newCode()}`,
          createdAt: now,
          deletedAt: null,
        })),
      );

      await plans().updateOne(
        { _id: new ObjectId(planId), "phases.id": phase.id },
        {
          $set: {
            "phases.$.rev": copied.length,
            "phases.$.strokes": copied.length,
          },
        },
      );

      return getPlan(planId);
    }
  }

  return toPlan(updated);
}

export interface PhasePatch {
  name?: string;
  objective?: string;
  points?: string[];
  abort?: string;
  durationSec?: number;
  locked?: boolean;
  assignments?: PlanAssignment[];
}

export async function patchPhase(
  planId: string,
  phaseId: string,
  patch: PhasePatch,
): Promise<Plan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  for (const [field, value] of Object.entries(patch)) {
    if (value !== undefined) set[`phases.$.${field}`] = value;
  }

  const updated = await plans().findOneAndUpdate(
    { _id: new ObjectId(planId), "phases.id": phaseId },
    { $set: set, $inc: { version: 1 } },
    { returnDocument: "after" },
  );

  return updated ? toPlan(updated) : null;
}

/**
 * The phases, in the order given.
 *
 * Order is the array's own, so reordering rewrites the array rather than a
 * field on each entry — which keeps «what order is this plan in» answerable by
 * one read, and makes an id missing from `order` impossible to half-apply.
 */
export async function reorderPhases(
  planId: string,
  order: string[],
): Promise<Plan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const doc = await plans().findOne({ _id: new ObjectId(planId) });
  if (!doc) return null;

  const known = new Set(doc.phases.map((phase) => phase.id));
  const asked = order.filter((id) => known.has(id));

  // Anything the client did not name keeps its place at the end, so a phase
  // added between the read and the write is never dropped.
  const rest = doc.phases.filter((phase) => !asked.includes(phase.id));
  const byId = new Map(doc.phases.map((phase) => [phase.id, phase]));

  const phases = [
    ...asked.map((id) => byId.get(id)!),
    ...rest,
  ];

  const updated = await plans().findOneAndUpdate(
    { _id: new ObjectId(planId) },
    {
      $set: { phases, updatedAt: new Date().toISOString() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  return updated ? toPlan(updated) : null;
}

export async function removePhase(
  planId: string,
  phaseId: string,
): Promise<Plan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const updated = await plans().findOneAndUpdate(
    // A plan always keeps one phase: a canvas with none has nowhere to draw.
    { _id: new ObjectId(planId), "phases.1": { $exists: true } },
    {
      $pull: { phases: { id: phaseId } },
      $set: { updatedAt: new Date().toISOString() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  if (!updated) return null;

  await strokes().deleteMany({ planId, phaseId });

  return toPlan(updated);
}

/* ------------------------------------------------------------------ */
/* Presenter                                                           */
/* ------------------------------------------------------------------ */

export async function setPresenter(
  planId: string,
  presenter: PlanPresenter | null,
): Promise<Plan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const updated = await plans().findOneAndUpdate(
    { _id: new ObjectId(planId) },
    {
      $set: { presenter, updatedAt: new Date().toISOString() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  return updated ? toPlan(updated) : null;
}

/* ------------------------------------------------------------------ */
/* Strokes                                                             */
/* ------------------------------------------------------------------ */

/**
 * Allocate the next revision of a phase, and publish it in the same write.
 *
 * This is the accompanying `plans` write the rule at the top of this file
 * demands, and the only way a stroke reaches anybody. `$elemMatch` re-asserts
 * the guards inside the filter — the phase exists, is not locked, has room —
 * the way `leaveSquad` re-asserts «last member» inside its own: two people
 * drawing the four-hundredth stroke at once cannot both get in.
 *
 * `null` means one of those guards refused; the caller re-reads once to say
 * which.
 */
async function allocateRev(
  planId: string,
  phaseId: string,
  countsAgainstTheCap: boolean,
): Promise<DbPlan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const room = countsAgainstTheCap
    ? { strokes: { $lt: PHASE_MAX_STROKES } }
    : {};

  const updated = await plans().findOneAndUpdate(
    {
      _id: new ObjectId(planId),
      archivedAt: { $in: [null, undefined] },
      phases: { $elemMatch: { id: phaseId, locked: false, ...room } },
    } as Filter<DbPlan>,
    {
      $inc: {
        "phases.$[p].rev": 1,
        "phases.$[p].strokes": countsAgainstTheCap ? 1 : 0,
        version: 1,
      },
      $set: { updatedAt: new Date().toISOString() },
    },
    { arrayFilters: [{ "p.id": phaseId }], returnDocument: "after" },
  );

  return updated ?? null;
}

function phaseOf(doc: DbPlan, phaseId: string): DbPhase | null {
  return doc.phases.find((phase) => phase.id === phaseId) ?? null;
}

export interface StrokeDraft {
  clientId: string;
  authorId: string;
  authorName: string;
  squadId: string;
  kind: StrokeKind;
  ink: PlanInk;
  width: number;
  points: number[];
  text: string;
  tokenUserId: string;
}

export type StrokeRefusal = "locked" | "full" | "gone";

/** Why an allocation was refused, read once, only when it was. */
async function refusalFor(
  planId: string,
  phaseId: string,
): Promise<StrokeRefusal> {
  const doc = await plans().findOne({ _id: new ObjectId(planId) });
  if (!doc || doc.archivedAt) return "gone";

  const phase = phaseOf(doc, phaseId);
  if (!phase) return "gone";
  if (phase.locked) return "locked";

  return "full";
}

export async function commitStroke(
  planId: string,
  phaseId: string,
  draft: StrokeDraft,
): Promise<{ stroke: PlanStroke } | { refusal: StrokeRefusal }> {
  const updated = await allocateRev(planId, phaseId, true);
  if (!updated) return { refusal: await refusalFor(planId, phaseId) };

  const phase = phaseOf(updated, phaseId);
  if (!phase) return { refusal: "gone" };

  const doc: DbPlanStroke = {
    _id: new ObjectId(),
    planId,
    phaseId,
    epoch: phase.epoch,
    rev: phase.rev,
    clientId: draft.clientId,
    authorId: draft.authorId,
    authorName: draft.authorName,
    squadId: draft.squadId,
    kind: draft.kind,
    ink: draft.ink,
    width: draft.width,
    points: draft.points,
    text: draft.text,
    tokenUserId: draft.tokenUserId,
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };

  try {
    await strokes().insertOne(doc);
  } catch (error) {
    if (!isDuplicate(error)) throw error;

    // A retried commit. Hand back the trace they already have, and give the
    // phase its slot back — the revision stays spent, which costs nothing.
    await plans().updateOne(
      { _id: new ObjectId(planId), "phases.id": phaseId },
      { $inc: { "phases.$.strokes": -1 } },
    );

    const existing = await strokes().findOne({
      planId,
      clientId: draft.clientId,
    });

    return existing
      ? { stroke: toStroke(existing) }
      : { refusal: "gone" };
  }

  return { stroke: toStroke(doc) };
}

/**
 * Rub one trace out, without losing the fact that it is gone.
 *
 * The tombstone takes a fresh revision, so the removal travels in the same
 * delta as a drawing would and reaches a client that was away.
 */
export async function eraseStroke(
  planId: string,
  strokeId: string,
): Promise<{ stroke: PlanStroke } | { refusal: StrokeRefusal }> {
  if (!ObjectId.isValid(strokeId)) return { refusal: "gone" };

  const existing = await strokes().findOne({
    _id: new ObjectId(strokeId),
    planId,
  });

  if (!existing) return { refusal: "gone" };
  if (existing.deletedAt) return { stroke: toStroke(existing) };

  const updated = await allocateRev(planId, existing.phaseId, false);
  if (!updated) return { refusal: await refusalFor(planId, existing.phaseId) };

  const phase = phaseOf(updated, existing.phaseId);
  if (!phase) return { refusal: "gone" };

  const gone = await strokes().findOneAndUpdate(
    { _id: existing._id, deletedAt: { $in: [null, undefined] } },
    {
      $set: { deletedAt: new Date().toISOString(), rev: phase.rev },
    },
    { returnDocument: "after" },
  );

  if (gone) {
    await plans().updateOne(
      { _id: new ObjectId(planId), "phases.id": existing.phaseId },
      { $inc: { "phases.$.strokes": -1 } },
    );
  }

  return gone ? { stroke: toStroke(gone) } : { refusal: "gone" };
}

/**
 * Put a trace somewhere else — a token following the squad from one phase to
 * the next, mostly. Supersedes in place under a fresh revision, so clients
 * replace it by id rather than drawing it twice.
 */
export async function moveStroke(
  planId: string,
  strokeId: string,
  points: number[],
): Promise<{ stroke: PlanStroke } | { refusal: StrokeRefusal }> {
  if (!ObjectId.isValid(strokeId)) return { refusal: "gone" };

  const existing = await strokes().findOne({
    _id: new ObjectId(strokeId),
    planId,
    deletedAt: { $in: [null, undefined] },
  });

  if (!existing) return { refusal: "gone" };

  const updated = await allocateRev(planId, existing.phaseId, false);
  if (!updated) return { refusal: await refusalFor(planId, existing.phaseId) };

  const phase = phaseOf(updated, existing.phaseId);
  if (!phase) return { refusal: "gone" };

  const moved = await strokes().findOneAndUpdate(
    { _id: existing._id },
    { $set: { points, rev: phase.rev } },
    { returnDocument: "after" },
  );

  return moved ? { stroke: toStroke(moved) } : { refusal: "gone" };
}

/**
 * Empty a phase.
 *
 * The epoch moves first and the strokes go second, so a stroke whose revision
 * was allocated before the clear and inserted after it lands in the old epoch
 * and is invisible to every delta — the one orphan a revision counter alone
 * cannot catch. The sweep then takes it with everything else.
 */
export async function clearPhase(
  planId: string,
  phaseId: string,
): Promise<Plan | null> {
  if (!ObjectId.isValid(planId)) return null;

  const updated = await plans().findOneAndUpdate(
    {
      _id: new ObjectId(planId),
      phases: { $elemMatch: { id: phaseId, locked: false } },
    },
    {
      $inc: { "phases.$[p].epoch": 1, version: 1 },
      $set: {
        "phases.$[p].rev": 0,
        "phases.$[p].strokes": 0,
        updatedAt: new Date().toISOString(),
      },
    },
    { arrayFilters: [{ "p.id": phaseId }], returnDocument: "after" },
  );

  if (!updated) return null;

  await strokes().deleteMany({ planId, phaseId });

  return toPlan(updated);
}

/**
 * Who drew one trace, or `null` when there is no such trace at all.
 *
 * The eraser only takes your own, and «your own» is read here rather than
 * trusted from the client — a projection of one field, since that is the whole
 * question.
 */
export async function strokeAuthor(
  planId: string,
  phaseId: string,
  strokeId: string,
): Promise<string | null> {
  if (!ObjectId.isValid(strokeId)) return null;

  const doc = await strokes().findOne(
    { _id: new ObjectId(strokeId), planId, phaseId },
    { projection: { authorId: 1 } },
  );

  return doc?.authorId ?? null;
}

/**
 * Everything drawn above a revision.
 *
 * Tombstones ride along only when the caller already holds something: a client
 * starting from zero has nothing to rub out, so a cold load carries the living
 * strokes alone whatever the phase's history of erasing.
 *
 * The cap is not a truncation the caller must handle: results come back in
 * revision order, so a client whose cursor is the highest revision it received
 * simply asks again and continues where it stopped.
 */
export async function strokesSince(
  planId: string,
  phaseId: string,
  epoch: number,
  since: number,
): Promise<PlanStroke[]> {
  const filter: Filter<DbPlanStroke> = {
    planId,
    phaseId,
    epoch,
    rev: { $gt: since },
  };

  if (since <= 0) filter.deletedAt = { $in: [null, undefined] };

  const docs = await strokes()
    .find(filter)
    .sort({ rev: 1 })
    .limit(PHASE_MAX_STROKES * 2)
    .toArray();

  return docs.map(toStroke);
}

/* ------------------------------------------------------------------ */
/* Policy                                                              */
/* ------------------------------------------------------------------ */

/**
 * Whether a reader runs this plan.
 *
 * A raid's plan answers to whoever commands its lead squad; a squad's plan, to
 * whoever commands the squad. `commandsSquad` already refuses to tell a leader
 * from a lieutenant, and nothing here starts to.
 */
export function governsPlan(
  plan: Pick<Plan, "scope">,
  ranks: { commands: boolean; leads: boolean },
): boolean {
  return plan.scope === "raid" ? ranks.leads : ranks.commands;
}

/**
 * Whether a reader may draw.
 *
 * Under `leaders`, a sub-squad's own leader still draws — they are briefing
 * their leg of the operation, and refusing them would leave the raid's lead
 * drawing for six squads at once.
 */
export function mayDrawOn(
  plan: Pick<Plan, "scope" | "drawPolicy">,
  ranks: { commands: boolean; leads: boolean },
): boolean {
  if (governsPlan(plan, ranks)) return true;

  return plan.drawPolicy === "all" ? true : ranks.commands;
}
