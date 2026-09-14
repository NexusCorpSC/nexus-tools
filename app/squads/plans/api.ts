import type {
  DrawPolicy,
  PlanAssignment,
  PlanStroke,
  PlanView,
  StrokeDelta,
  StrokeKind,
  PlanInk,
} from "@/types/plan";

/**
 * The plan routes, called from the browser — the same ones the desktop overlay
 * calls, with the session cookie doing the rest.
 *
 * Two shapes, not one. Everything that changes the plan answers the whole
 * `PlanView`, which is what lets the page show the result of a tap without
 * waiting for the stream. The strokes do not: they are pulled by delta and
 * pushed one at a time, because a drawing is not something to re-send whole
 * every time somebody adds a line to it.
 *
 * `squadId` says which of the caller's squads is meant — it decides whether the
 * plans they see are their squad's or their raid's — and `null` leaves the
 * choice to the API.
 */

function at(path: string, squadId: string | null): string {
  return squadId ? `${path}?squad=${encodeURIComponent(squadId)}` : path;
}

async function json<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers:
      init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });

  const answer = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(answer?.error ?? `HTTP ${response.status}`);
  }

  return answer as T;
}

async function call(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<PlanView> {
  const answer = await json<Partial<PlanView>>(path, init);

  return {
    feed: answer.feed ?? { scope: "squad", ownerId: null, plans: [] },
    plan: answer.plan ?? null,
  };
}

/** Raised by a delta whose epoch no longer matches: start again from zero. */
export class PhaseClearedError extends Error {
  readonly epoch: number;

  constructor(epoch: number) {
    super("Phase cleared");
    this.name = "PhaseClearedError";
    this.epoch = epoch;
  }
}

const PLANS = "/api/squads/plans";

export const planApi = {
  list: (squadId: string | null) => call(at(PLANS, squadId)),

  read: (planId: string, squadId: string | null) =>
    call(at(`${PLANS}/${planId}`, squadId)),

  create: (
    squadId: string | null,
    body: { name?: string; from?: string; firstPhase?: string },
  ) => call(at(PLANS, squadId), { method: "POST", body }),

  update: (
    planId: string,
    squadId: string | null,
    body: {
      name?: string;
      drawPolicy?: DrawPolicy;
      background?: { url: string; width: number; height: number } | null;
      archived?: boolean;
    },
  ) => call(at(`${PLANS}/${planId}`, squadId), { method: "PATCH", body }),

  remove: (planId: string, squadId: string | null) =>
    call(at(`${PLANS}/${planId}`, squadId), { method: "DELETE" }),

  addPhase: (
    planId: string,
    squadId: string | null,
    body: { name?: string; after?: string },
  ) => call(at(`${PLANS}/${planId}/phases`, squadId), { method: "POST", body }),

  reorderPhases: (planId: string, squadId: string | null, order: string[]) =>
    call(at(`${PLANS}/${planId}/phases`, squadId), {
      method: "PATCH",
      body: { order },
    }),

  patchPhase: (
    planId: string,
    phaseId: string,
    squadId: string | null,
    body: {
      name?: string;
      objective?: string;
      points?: string[];
      abort?: string;
      durationSec?: number;
      locked?: boolean;
      assignments?: PlanAssignment[];
    },
  ) =>
    call(at(`${PLANS}/${planId}/phases/${phaseId}`, squadId), {
      method: "PATCH",
      body,
    }),

  removePhase: (planId: string, phaseId: string, squadId: string | null) =>
    call(at(`${PLANS}/${planId}/phases/${phaseId}`, squadId), {
      method: "DELETE",
    }),

  clearPhase: (planId: string, phaseId: string, squadId: string | null) =>
    call(at(`${PLANS}/${planId}/phases/${phaseId}/strokes`, squadId), {
      method: "DELETE",
    }),

  present: (planId: string, phaseId: string, squadId: string | null) =>
    call(at(`${PLANS}/${planId}/presenter`, squadId), {
      method: "PUT",
      body: { phaseId },
    }),

  endBriefing: (planId: string, squadId: string | null) =>
    call(at(`${PLANS}/${planId}/presenter`, squadId), { method: "DELETE" }),

  /* ---------------------------------------------------------------- */
  /* Strokes                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Everything drawn above a revision.
   *
   * `since` is what the caller was handed, never what the feed announced — a
   * revision is published an instant before the stroke carrying it exists, so a
   * client that trusted the feed would step over the one still in flight.
   */
  async strokes(
    planId: string,
    phaseId: string,
    squadId: string | null,
    since: number,
    epoch: number,
  ): Promise<StrokeDelta> {
    const query = new URLSearchParams({
      since: String(since),
      epoch: String(epoch),
    });

    if (squadId) query.set("squad", squadId);

    const path = `${PLANS}/${planId}/phases/${phaseId}/strokes?${query}`;

    const response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
    });

    const answer = (await response.json().catch(() => null)) as
      | (Partial<StrokeDelta> & { error?: string })
      | null;

    // The phase was emptied under us: what we hold is gone, and the answer says
    // which epoch to start from.
    if (response.status === 409) {
      throw new PhaseClearedError(answer?.epoch ?? epoch + 1);
    }

    if (!response.ok) {
      throw new Error(answer?.error ?? `HTTP ${response.status}`);
    }

    return {
      phaseId,
      epoch: answer?.epoch ?? epoch,
      rev: answer?.rev ?? since,
      strokes: answer?.strokes ?? [],
    };
  },

  commit: (
    planId: string,
    phaseId: string,
    squadId: string | null,
    body: {
      clientId: string;
      kind: StrokeKind;
      ink: PlanInk;
      width: number;
      points: number[];
      text?: string;
      tokenUserId?: string;
    },
  ) =>
    json<{ stroke: PlanStroke }>(
      at(`${PLANS}/${planId}/phases/${phaseId}/strokes`, squadId),
      { method: "POST", body },
    ),

  erase: (
    planId: string,
    phaseId: string,
    strokeId: string,
    squadId: string | null,
  ) =>
    json<{ stroke: PlanStroke }>(
      at(`${PLANS}/${planId}/phases/${phaseId}/strokes/${strokeId}`, squadId),
      { method: "DELETE" },
    ),

  move: (
    planId: string,
    phaseId: string,
    strokeId: string,
    squadId: string | null,
    points: number[],
  ) =>
    json<{ stroke: PlanStroke }>(
      at(`${PLANS}/${planId}/phases/${phaseId}/strokes/${strokeId}`, squadId),
      { method: "PATCH", body: { points } },
    ),
};
