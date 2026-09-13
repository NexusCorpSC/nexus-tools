"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useEventStream } from "@/lib/use-event-stream";
import type { PlanStroke, PlanView, StrokeDelta } from "@/types/plan";
import type { SquadView } from "@/types/squad";
import { PhaseClearedError, planApi } from "./api";

/**
 * A plan de vol, kept fresh, and the one way to change it.
 *
 * Two sources feed this, and they carry different things on purpose. The event
 * stream pushes a **feed** — names, order, locks, and a revision per phase —
 * and every write answers the whole view; neither carries a single stroke. The
 * drawing is pulled separately, by delta, against those revisions.
 *
 * The orderings that have to hold are the squad board's, for the same reasons:
 * a push is held while a write is in flight and applied after, and a push whose
 * `version` is older than what is on screen is dropped.
 *
 * **The rule that is this hook's own**: a phase's cursor is the highest
 * revision it was *handed*, never the one the feed announces. A revision is
 * published an instant before the stroke carrying it is inserted, so a client
 * that trusted the feed would step over the one still in flight — and never
 * come back for it, because its cursor would already be past. Taking the
 * highest revision actually received makes a gap impossible: the missing stroke
 * simply is not in the answer, the cursor does not move, and the next pass
 * brings it.
 *
 * Liveness comes from `RETRIES`: while the feed claims a revision above the
 * cursor, ask again, a few times, further apart each time. Then give up and
 * align — an allocation whose insert died would otherwise hold the phase back
 * for ever, and one lost trace is redrawn in a second.
 */

/**
 * How long to wait before each re-ask, in milliseconds. Then give up.
 *
 * A revision is published an instant before its stroke is inserted, so the
 * first re-ask covers the ordinary case — a commit landing between two passes.
 * The rest cover a slow write. Past them, the stroke is not coming.
 */
const RETRIES = [150, 400, 1_000];

/** One phase's drawing, and where the client stands in it. */
export interface PhaseLayer {
  epoch: number;
  /** The highest revision handed over. Never read off the feed. */
  cursor: number;
  /** Live strokes, oldest first — revision order is drawing order. */
  strokes: PlanStroke[];
  loading: boolean;
}

const EMPTY_LAYER: PhaseLayer = {
  epoch: 0,
  cursor: 0,
  strokes: [],
  loading: true,
};

function applyDelta(layer: PhaseLayer, delta: StrokeDelta): PhaseLayer {
  const byId = new Map(layer.strokes.map((stroke) => [stroke.id, stroke]));
  let cursor = layer.cursor;

  for (const stroke of delta.strokes) {
    cursor = Math.max(cursor, stroke.rev);

    // A tombstone is a removal that travelled, not a stroke to draw.
    if (stroke.deletedAt) byId.delete(stroke.id);
    else byId.set(stroke.id, stroke);
  }

  return {
    epoch: delta.epoch,
    cursor,
    strokes: [...byId.values()].sort((a, b) => a.rev - b.rev),
    loading: false,
  };
}

type Run = (write: () => Promise<PlanView>) => Promise<boolean>;

export interface PlanState {
  view: PlanView;
  squad: SquadView;
  /** The layers of the phases currently on screen, by phase id. */
  layers: Record<string, PhaseLayer>;
  run: Run;
  busy: boolean;
  offline: boolean;
  /** Puts a stroke on screen at once, before its commit answers. */
  draw: (phaseId: string, stroke: PlanStroke) => void;
  /** Takes one off at once, for the same reason. */
  rub: (phaseId: string, strokeId: string) => void;
  /** Asks for a phase's drawing — mounting it, or after a failed write. */
  watch: (phaseIds: string[]) => void;
}

export function usePlan(
  initialPlan: PlanView,
  initialSquad: SquadView,
  squadId: string | null,
): PlanState {
  const t = useTranslations("Plans");

  const [view, setView] = useState(initialPlan);
  const [squad, setSquad] = useState(initialSquad);
  const [layers, setLayers] = useState<Record<string, PhaseLayer>>({});
  const [writing, setWriting] = useState(0);

  const writingRef = useRef(0);
  const viewRef = useRef(view);
  const held = useRef<PlanView | null>(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const commit = useCallback((next: PlanView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  /**
   * What replaces the screen, unless it is older than the screen.
   *
   * The plan's `version` grows with every write, strokes included, so a view
   * carrying a smaller one for the same plan was read before something already
   * shown. The feed around it is taken from the newer of the two either way —
   * it is a listing, and a stale listing is only ever a missing name.
   */
  const merge = useCallback((next: PlanView, shown: PlanView): PlanView => {
    if (
      next.plan &&
      shown.plan &&
      next.plan.id === shown.plan.id &&
      next.plan.version < shown.plan.version
    ) {
      return { feed: next.feed, plan: shown.plan };
    }

    return next;
  }, []);

  /* ---------------------------------------------------------------- */
  /* The stream                                                        */
  /* ---------------------------------------------------------------- */

  const onEvent = useCallback(
    (topic: string, data: unknown) => {
      if (topic === "squad") {
        setSquad(data as SquadView);
        return;
      }

      if (topic !== "plan") return;

      const feed = data as PlanView["feed"];
      const shown = viewRef.current;

      // The feed names every live plan of the scope; the one on screen keeps
      // its texts, which the feed does not carry, and takes the summary's
      // revisions so the pump below can notice the drawing moved.
      const summary = feed.plans.find((plan) => plan.id === shown.plan?.id);

      const next: PlanView = {
        feed,
        plan:
          shown.plan && summary
            ? { ...shown.plan, ...summary, phases: shown.plan.phases }
            : shown.plan,
      };

      if (writingRef.current > 0) {
        held.current = next;
        return;
      }

      commit(merge(next, shown));
    },
    [commit, merge],
  );

  const { offline } = useEventStream({
    topics: ["squad", "plan"],
    squad: squadId,
    onEvent,
  });

  /* ---------------------------------------------------------------- */
  /* Writing                                                           */
  /* ---------------------------------------------------------------- */

  const run = useCallback<Run>(
    async (write) => {
      writingRef.current += 1;
      setWriting((count) => count + 1);

      try {
        const next = await write();
        commit(merge(next, viewRef.current));
        return true;
      } catch (error) {
        toast.error(t("errorTitle"), {
          description: error instanceof Error ? error.message : undefined,
        });
        return false;
      } finally {
        writingRef.current -= 1;
        setWriting((count) => count - 1);

        if (writingRef.current === 0 && held.current) {
          const pushed = held.current;
          held.current = null;
          commit(merge(pushed, viewRef.current));
        }
      }
    },
    [commit, merge, t],
  );

  /* ---------------------------------------------------------------- */
  /* The drawing                                                       */
  /* ---------------------------------------------------------------- */

  /** The phases whose drawing is wanted: the one on screen, and its ghost. */
  const [watched, setWatched] = useState<string[]>([]);
  const watch = useCallback((phaseIds: string[]) => {
    setWatched((current) =>
      current.length === phaseIds.length &&
      current.every((id, index) => id === phaseIds[index])
        ? current
        : phaseIds,
    );
  }, []);

  /** One pump per phase at a time: a second would only re-ask what the first is asking. */
  const pumping = useRef(new Map<string, boolean>());
  const layersRef = useRef(layers);
  const gone = useRef(false);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
    };
  }, []);

  /**
   * Catch one phase up, re-asking until it is.
   *
   * The whole retry lives here rather than in the effect that starts it: an
   * effect that rescheduled timers on every render would keep cancelling the
   * long waits before they fired, and the second re-ask would never happen.
   *
   * Each pass asks from the revision actually held and stops as soon as what
   * came back reaches what the feed announced. What it cannot reach — a
   * revision published for a stroke whose insert died — it gives up on, aligns
   * past, and forgets. One trace, redrawn in a second, against a phase that
   * would otherwise never catch up again.
   */
  const pump = useCallback(
    async (planId: string, phaseId: string) => {
      if (pumping.current.get(phaseId)) return;
      pumping.current.set(phaseId, true);

      const held = layersRef.current[phaseId] ?? EMPTY_LAYER;
      let cursor = held.cursor;
      let epoch = held.epoch;

      try {
        for (let attempt = 0; attempt <= RETRIES.length; attempt += 1) {
          if (gone.current) return;

          let delta: StrokeDelta;

          try {
            delta = await planApi.strokes(planId, phaseId, squadId, cursor, epoch);
          } catch (error) {
            // The phase was emptied under us: what we hold is gone, and the
            // answer names the epoch to start again from.
            if (error instanceof PhaseClearedError) {
              cursor = 0;
              epoch = error.epoch;

              if (!gone.current) {
                setLayers((current) => ({
                  ...current,
                  [phaseId]: { ...EMPTY_LAYER, epoch: error.epoch },
                }));
              }

              continue;
            }

            // Anything else is a hiccup; the next feed push comes back for it.
            return;
          }

          if (gone.current) return;

          setLayers((current) => ({
            ...current,
            [phaseId]: applyDelta(current[phaseId] ?? EMPTY_LAYER, delta),
          }));

          const delivered = delta.strokes.reduce(
            (highest, stroke) => Math.max(highest, stroke.rev),
            cursor,
          );

          epoch = delta.epoch;
          cursor = delivered;

          // Everything the phase claims to hold is on screen.
          if (delivered >= delta.rev) return;

          if (attempt < RETRIES.length) {
            await new Promise((resume) => setTimeout(resume, RETRIES[attempt]));
          }
        }

        if (gone.current) return;

        setLayers((current) => {
          const layer = current[phaseId] ?? EMPTY_LAYER;

          return {
            ...current,
            [phaseId]: { ...layer, cursor: Math.max(layer.cursor, cursor), loading: false },
          };
        });
      } finally {
        pumping.current.set(phaseId, false);
      }
    },
    [squadId],
  );

  /**
   * Ask for whatever the feed says is missing.
   *
   * A phase is behind when its epoch differs — it was emptied — or when the
   * feed claims a revision above the cursor. Nothing is written here: the pump
   * owns every change, so a render never cascades out of this effect.
   */
  useEffect(() => {
    const plan = view.plan;
    if (!plan) return;

    for (const phaseId of watched) {
      const phase = plan.phases.find((candidate) => candidate.id === phaseId);
      if (!phase) continue;

      const layer = layersRef.current[phaseId] ?? EMPTY_LAYER;

      if (
        layer.loading ||
        layer.epoch !== phase.epoch ||
        phase.rev > layer.cursor
      ) {
        void pump(plan.id, phaseId);
      }
    }
  }, [view.plan, watched, pump, layers]);

  /**
   * A squad that joins or leaves a raid changes which plans its members see,
   * and the plan topic cannot notice: it watches `plans` alone, deliberately,
   * so that a «prêt» toggle does not cost every member a plan read. The squad
   * topic does notice, and this is where that is picked up.
   */
  const raidId = squad.squad?.raidId ?? null;
  const knownRaid = useRef(raidId);

  useEffect(() => {
    if (knownRaid.current === raidId) return;
    knownRaid.current = raidId;

    void planApi
      .list(squadId)
      .then((next) => commit({ feed: next.feed, plan: viewRef.current.plan }))
      .catch(() => undefined);
  }, [raidId, squadId, commit]);

  /* ---------------------------------------------------------------- */
  /* Local echo                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * A trace appears under the pen, not a round trip later.
   *
   * The commit answers with the stored stroke and the delta brings it again;
   * both land on the same id, so the optimistic one is replaced rather than
   * doubled. A commit that fails is undone by `rub`.
   */
  const draw = useCallback((phaseId: string, stroke: PlanStroke) => {
    setLayers((current) => {
      const layer = current[phaseId] ?? EMPTY_LAYER;
      const byId = new Map(layer.strokes.map((one) => [one.id, one]));
      byId.set(stroke.id, stroke);

      return {
        ...current,
        [phaseId]: {
          ...layer,
          strokes: [...byId.values()].sort((a, b) => a.rev - b.rev),
        },
      };
    });
  }, []);

  const rub = useCallback((phaseId: string, strokeId: string) => {
    setLayers((current) => {
      const layer = current[phaseId];
      if (!layer) return current;

      return {
        ...current,
        [phaseId]: {
          ...layer,
          strokes: layer.strokes.filter((stroke) => stroke.id !== strokeId),
        },
      };
    });
  }, []);

  return {
    view,
    squad,
    layers,
    run,
    busy: writing > 0,
    offline,
    draw,
    rub,
    watch,
  };
}
