/**
 * A plan de vol: one drawing shared by a squad — or by the raid it belongs to —
 * cut into the phases of an operation.
 *
 * A briefing is spatial and it unfolds in time, which is the two things an
 * announcement cannot carry. So a plan is a **background**, drawn once and
 * locked, and a **phase per step** over it: each phase holds only its own
 * strokes, and the one before it can be shown ghosted underneath so the room
 * sees where the squad is coming from.
 *
 * The model is split in two on purpose, and the split is load-bearing:
 *
 * - the **feed** (`PlanFeed`) is what the event stream pushes — names, order,
 *   locks, and a revision counter per phase. It is small, and its size does not
 *   grow with the drawing.
 * - the **strokes** are pulled over HTTP, by delta, against that revision.
 *
 * The reason is not the size of a payload. `refresh()` in `lib/events/hub.ts`
 * re-reads a topic's view once per connected subscription and only then lets
 * the fingerprint decide whether to send it — so a stroke in a raid of twenty
 * costs twenty reads whatever it weighs. The pushed view has to be cheap to
 * *compute*, not merely cheap to transmit; a drawing that was the view would
 * cost twenty full reads of itself on every pen-up.
 *
 * Mirrored by hand in `nexus-app/src/types/nexus.ts`, as `types/squad.ts` is:
 * adding a stroke kind, an ink or a dash means adding it there too, or the
 * overlay draws a hole where the trace should be.
 */

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

export const PLAN_NAME_MAX_LENGTH = 60;

/** As long as a squad name: they sit in the same header. */
export const PHASE_NAME_MAX_LENGTH = 40;

export const PHASE_OBJECTIVE_MAX_LENGTH = 600;
export const PHASE_POINT_MAX_LENGTH = 140;

/** Past six, nobody reads them out before a drop. */
export const PHASE_MAX_POINTS = 6;

export const PHASE_ABORT_MAX_LENGTH = 280;
export const ASSIGNMENT_TASK_MAX_LENGTH = 120;
export const STROKE_TEXT_MAX_LENGTH = 240;

/**
 * How many plans of one squad or raid the event stream carries at once.
 *
 * This is the direct bound on the pushed view, and the view is re-read once per
 * connected member on every stroke — so it is the number that decides what a
 * pen-up costs. Three is a plan, its rehearsal and the one from last week;
 * archive to keep more.
 */
export const PLAN_MAX_ACTIVE_PER_OWNER = 3;

/** Archived ones included — past this, an old plan has to go. */
export const PLAN_MAX_PER_OWNER = 12;

/**
 * Past ten phases the manifest is large enough that pushing it on every stroke
 * starts to cost, and a briefing that long has stopped being a briefing.
 */
export const PLAN_MAX_PHASES = 10;

/**
 * Bounds the first load of a phase, which is fetched in one go: about 250 KB
 * raw, 45 KB over the wire. Re-asserted inside the write filter, so the count
 * the UI shows is the one the database enforces.
 */
export const PHASE_MAX_STROKES = 400;

/** After simplification; a free trace rarely needs a quarter of it. */
export const STROKE_MAX_POINTS = 256;

/**
 * The square every stroke is stored in, whatever the screen.
 *
 * Coordinates are **integers** in `0…PLAN_GRID`: a plan drawn on a desktop and
 * read on a phone is the same plan, `5234` is four bytes where
 * `0.5234567901234568` is eighteen, and the simplification epsilon stops
 * depending on the device it was drawn on.
 */
export const PLAN_GRID = 10_000;

/** Longest a phase may be given, in seconds — four hours is already absurd. */
export const PHASE_MAX_DURATION_SEC = 14_400;

/** The same ceiling the item and blueprint images answer to. */
export const PLAN_BACKGROUND_MAX_BYTES = 8_000_000;

/* ------------------------------------------------------------------ */
/* Closed sets                                                         */
/* ------------------------------------------------------------------ */

/**
 * Who the plan belongs to.
 *
 * A squad in a raid briefs with the raid; one running alone briefs on its own.
 * The same bascule the squad board already offers between the two rosters.
 */
export const PLAN_SCOPES = ["squad", "raid"] as const;
export type PlanScope = (typeof PLAN_SCOPES)[number];

/** Who may draw. Everyone, by default: a briefing is not a lecture. */
export const DRAW_POLICIES = ["all", "leaders"] as const;
export type DrawPolicy = (typeof DRAW_POLICIES)[number];

export const STROKE_KINDS = [
  "pen",
  "line",
  "arrow",
  "rect",
  "ellipse",
  "text",
  "token",
  "pin",
] as const;
export type StrokeKind = (typeof STROKE_KINDS)[number];

/**
 * The inks a trace may wear, and nothing else.
 *
 * Names rather than colours, for the same reason a role travels as
 * `"heart-pulse"`: the client decides what it looks like. `squad` is the one
 * that earns its keep — it resolves to the hue the raid board already gives
 * the author's squad, so a glance at the plan says who drew what without a
 * legend.
 */
export const PLAN_INKS = [
  "squad",
  "amber",
  "red",
  "green",
  "sky",
  "violet",
  "white",
] as const;
export type PlanInk = (typeof PLAN_INKS)[number];

/** Thin, normal, fat. A slider would only produce illegible plans. */
export const STROKE_WIDTHS = [3, 6, 12] as const;
export type StrokeWidth = (typeof STROKE_WIDTHS)[number];

/**
 * How the line of a shape is broken up.
 *
 * A briefing draws two things that look alike and mean the opposite: where the
 * squad *will* be, and where it must *not* go. A dashed rectangle says
 * «planned, not yet» without needing a legend, which is why this is worth a
 * field rather than a second ink.
 *
 * It applies to the five geometric kinds only. A token in dots would say
 * nothing, and the head of an arrow stays solid whatever its shaft does.
 */
export const STROKE_DASHES = ["solid", "dashed", "dotted"] as const;
export type StrokeDash = (typeof STROKE_DASHES)[number];

/** The kinds a dash is drawn on. A label or a token in dots reads as a bug. */
export const DASHED_KINDS = ["pen", "line", "arrow", "rect", "ellipse"] as const;

export function isPlanScope(value: unknown): value is PlanScope {
  return (PLAN_SCOPES as readonly unknown[]).includes(value);
}

export function isDrawPolicy(value: unknown): value is DrawPolicy {
  return (DRAW_POLICIES as readonly unknown[]).includes(value);
}

export function isStrokeKind(value: unknown): value is StrokeKind {
  return (STROKE_KINDS as readonly unknown[]).includes(value);
}

export function isPlanInk(value: unknown): value is PlanInk {
  return (PLAN_INKS as readonly unknown[]).includes(value);
}

export function isStrokeWidth(value: unknown): value is StrokeWidth {
  return (STROKE_WIDTHS as readonly unknown[]).includes(value);
}

export function isStrokeDash(value: unknown): value is StrokeDash {
  return (STROKE_DASHES as readonly unknown[]).includes(value);
}

/**
 * Whether a kind wears a dash at all.
 *
 * Takes `unknown` so the toolbar can ask it about a *tool* — `pan` and
 * `eraser` are not stroke kinds and must answer no without a cast.
 */
export function wearsDash(kind: unknown): boolean {
  return (DASHED_KINDS as readonly unknown[]).includes(kind);
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

/** Who does what during one phase — the roster, said in the plan's terms. */
export interface PlanAssignment {
  userId: string;
  /** Kept beside the id so a phase reads the same after someone leaves. */
  name: string;
  task: string;
}

/** Whoever is walking the room through the plan right now. */
export interface PlanPresenter {
  userId: string;
  name: string;
  /** The phase everyone's view follows, until they take back control. */
  phaseId: string;
  startedAt: string;
}

/**
 * One step of the plan: its own layer of strokes, and what it asks of the
 * squad in words.
 */
export interface PlanPhase {
  id: string;
  /** Position in the plan, from 0. Reordering rewrites these, nothing else. */
  order: number;
  name: string;
  objective: string;
  /** The handful of things nobody may improvise on. */
  points: string[];
  /** When to give up on this phase — the one line people forget to agree. */
  abort: string;
  /** How long this step is expected to take; the T+ of the next one follows. */
  durationSec: number;
  /** A validated phase stops accepting strokes, from everyone, rank included. */
  locked: boolean;
  assignments: PlanAssignment[];
  /**
   * The revision of the last stroke allocated on this phase.
   *
   * Monotonic, per phase, allocated by the same `$inc` that publishes it. A
   * client asks for everything above the revision it actually holds and is up
   * to date again — which is the whole synchronisation protocol. Erasing and
   * moving allocate one too, so a removal travels in the same delta as a
   * drawing.
   *
   * A client must never take *this* number as its cursor: a revision is
   * published an instant before the stroke carrying it is inserted, so the
   * cursor is `max(rev)` over the strokes actually delivered. Otherwise a
   * client would step over the one stroke that was still in flight.
   */
  rev: number;
  /**
   * Bumped when the phase is emptied.
   *
   * Clearing deletes the strokes outright rather than leaving four hundred
   * tombstones behind. Every stroke carries the epoch it was drawn in, so a
   * stroke whose revision was allocated before the clear and inserted after it
   * is simply invisible in the new epoch — the one orphan a revision counter
   * alone cannot catch. A client whose epoch differs throws its layer away and
   * asks again from zero.
   */
  epoch: number;
  /** Live strokes on the phase. Enforced in the write filter, shown by the UI. */
  strokes: number;
}

/**
 * A phase as the feed carries it: enough to draw the strip and to know whether
 * the drawing moved, and not one byte more.
 *
 * The name is here because the strip has to redraw from the push alone when the
 * presenter steps. The long texts are not: they would ride every pen-up.
 */
export interface PlanPhaseSummary {
  id: string;
  order: number;
  name: string;
  durationSec: number;
  locked: boolean;
  rev: number;
  epoch: number;
  strokes: number;
}

/** A plan as the feed carries it — see the note at the top of this file. */
export interface PlanSummary {
  id: string;
  scope: PlanScope;
  ownerId: string;
  name: string;
  backgroundUrl: string | null;
  /** The background's own pixel size, so the canvas can frame it before it loads. */
  backgroundW: number;
  backgroundH: number;
  drawPolicy: DrawPolicy;
  presenter: PlanPresenter | null;
  archivedAt: string | null;
  /**
   * Bumped by every write, strokes included.
   *
   * It orders what the stream pushes against what a client's own writes answer,
   * the way `Squad.version` does. What tells «somebody drew» from «somebody
   * rewrote the briefing» is not this but `phases[].rev`: a client refetches
   * the plan's texts when `version` moves *and* no phase revision did.
   */
  version: number;
  updatedAt: string;
  phases: PlanPhaseSummary[];
}

/** A plan in full, texts included: what `GET /api/squads/plans/:planId` answers. */
export interface Plan extends Omit<PlanSummary, "phases"> {
  phases: PlanPhase[];
}

/**
 * One trace on one phase.
 *
 * Every kind is the same record, read differently: `points` holds the trace for
 * `pen`, the two ends for `line` and `arrow`, two opposite corners for `rect`
 * and `ellipse`, and the single anchor for `text`, `token` and `pin`.
 *
 * A stroke is appended or superseded, **never mutated without allocating a new
 * revision** — that is what makes an erase and a token move reach everybody the
 * same way a drawing does.
 */
export interface PlanStroke {
  id: string;
  phaseId: string;
  /** The epoch of the phase when it was drawn; see `PlanPhase.epoch`. */
  epoch: number;
  rev: number;
  /**
   * Minted by whoever drew it, before the request.
   *
   * A commit that times out is retried, and without this the retry would draw
   * the trace twice; a unique index on `{planId, clientId}` turns the second
   * one into «here is the one you already have».
   */
  clientId: string;
  authorId: string;
  authorName: string;
  /**
   * The author's squad when they drew it — a fact of its own, not a copy of the
   * plan's owner, and what the `squad` ink resolves against.
   */
  squadId: string;
  kind: StrokeKind;
  ink: PlanInk;
  width: number;
  /**
   * Solid unless somebody said otherwise.
   *
   * Added after the first plans were drawn, so a stroke stored without it reads
   * back as `"solid"` — the mapper absorbs that, not the callers.
   */
  dash: StrokeDash;
  /** Flat `[x0, y0, x1, y1, …]`, integers in `0…PLAN_GRID`. */
  points: number[];
  /** The label, for `text` and `pin`; empty otherwise. */
  text: string;
  /** The member a `token` stands for; empty otherwise. */
  tokenUserId: string;
  /** Set when erased. A tombstone still travels, so the removal reaches everyone. */
  deletedAt: string | null;
  createdAt: string;
}

/**
 * What a delta fetch answers: everything above the revision that was asked.
 *
 * Tombstones are only included when `since > 0` — a client starting from zero
 * has nothing to erase, so a cold load carries the living strokes alone,
 * whatever the phase's history of rubbing out.
 */
export interface StrokeDelta {
  phaseId: string;
  /** The phase's epoch as this request read it. A mismatch means «start over». */
  epoch: number;
  /** Where the phase stands. Not a cursor — see `PlanPhase.rev`. */
  rev: number;
  strokes: PlanStroke[];
}

/** Every live plan of the caller's scope, light — the event stream's payload. */
export interface PlanFeed {
  scope: PlanScope;
  /** The squad or raid the plans belong to, `null` when the caller has no squad. */
  ownerId: string | null;
  plans: PlanSummary[];
}

/**
 * What every plan route answers: where the caller stands, in one object.
 *
 * The feed always, so a client never has to ask twice to learn a plan was
 * renamed or archived; `plan` carries the one the request named, in full.
 * Answering the whole view is what lets a click show its own result without
 * waiting for the stream — the same contract the squad routes hold to.
 */
export interface PlanView {
  feed: PlanFeed;
  plan: Plan | null;
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

/**
 * When a phase starts, counted from the top of the operation.
 *
 * Durations chain: correcting one step pushes every later T+ along with it,
 * which is the point of storing a duration rather than a time.
 */
export function phaseStartSec(
  phases: readonly { id: string; durationSec: number }[],
  phaseId: string,
): number {
  let total = 0;

  for (const phase of phases) {
    if (phase.id === phaseId) break;
    total += phase.durationSec;
  }

  return total;
}

/** `T+06:00`, and `T+1:04:00` once an operation runs past the hour. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60) % 60;
  const hours = Math.floor(safe / 3600);
  const rest = safe % 60;

  const pad = (value: number) => value.toString().padStart(2, "0");

  return hours > 0
    ? `T+${hours}:${pad(minutes)}:${pad(rest)}`
    : `T+${pad(minutes)}:${pad(rest)}`;
}

/** The plan's own length: every phase, end to end. */
export function planDurationSec(
  phases: readonly { durationSec: number }[],
): number {
  return phases.reduce((total, phase) => total + phase.durationSec, 0);
}

/* ------------------------------------------------------------------ */
/* Ordering                                                            */
/* ------------------------------------------------------------------ */

/** Phases as the plan reads, whatever order the document stored them in. */
export function inPlanOrder<T extends { order: number }>(phases: T[]): T[] {
  return [...phases].sort((a, b) => a.order - b.order);
}

/** The phase before this one, whose trace the ghost layer shows. */
export function phaseBefore<T extends { id: string; order: number }>(
  phases: T[],
  phaseId: string,
): T | null {
  const ordered = inPlanOrder(phases);
  const at = ordered.findIndex((phase) => phase.id === phaseId);

  return at > 0 ? ordered[at - 1] : null;
}
