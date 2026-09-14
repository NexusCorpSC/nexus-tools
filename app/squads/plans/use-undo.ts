"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { PlanStroke } from "@/types/plan";
import { planApi, PlanHttpError } from "./api";

/**
 * Taking back your own last gesture — and nothing else.
 *
 * Three words in the brief carry the whole design: *ses traits locaux*. What
 * this remembers is what **this browser** did, in **this session**, to **its
 * own** traces. It is not a history of the plan and it never becomes one: a
 * leader rubbing somebody's arrow out does not land on their stack, and closing
 * the tab is the end of it. A stack that survived a reload would be offering to
 * undo something the drawer no longer remembers doing.
 *
 * It rests on one property of the protocol: erasing leaves a **tombstone**
 * rather than deleting, so taking a gesture back is raising that tombstone —
 * the trace keeps the id it always had. That is why a step is three fields and
 * why undoing a thing ten times does not leave ten copies of it in the busiest
 * collection in the product. `restoreStroke` in `lib/plans.ts` is the other
 * half.
 *
 * **Nothing here is cleared from an effect.** A phase change, a phase somebody
 * emptied, a trace a leader took first — all three are read from the truth at
 * render time rather than kept in step with it by a listener. That is the house
 * rule (`react-hooks/set-state-in-effect` is an error), and it is also simply
 * the version with fewer ways to be wrong.
 */

/** Past this it is not an undo, it is a history. */
const DEPTH = 40;

/** One thing this browser did to one phase, and enough to take it back. */
export interface UndoStep {
  act: "draw" | "erase";
  phaseId: string;
  /** The epoch it happened in. A phase emptied since makes it meaningless. */
  epoch: number;
  /**
   * The server's id — or the optimistic `local-…` one until the commit
   * answers, at which point `settle` swaps it.
   */
  strokeId: string;
  /**
   * The trace itself, carried rather than looked up.
   *
   * Undoing an erase has to put it back on screen before the round trip
   * answers, and by then it is in no layer to be read from.
   */
  stroke: PlanStroke;
}

interface Stack {
  epoch: number;
  undo: UndoStep[];
  redo: UndoStep[];
}

const EMPTY: Stack = { epoch: -1, undo: [], redo: [] };

/** A trace still on its way to the server cannot be undone by id it has not got. */
function inFlight(step: UndoStep): boolean {
  return step.strokeId.startsWith("local-");
}

/**
 * Whether a step still describes reality.
 *
 * A `draw` is undoable while its trace is on the phase; an `erase` while its
 * trace is off it. Anything else means somebody else got there first, and the
 * step is dropped rather than fought over.
 */
function stillTrue(step: UndoStep, present: Set<string>): boolean {
  return step.act === "draw"
    ? present.has(step.strokeId)
    : !present.has(step.strokeId);
}

/** Whether the next press would do anything, without changing anything. */
function ready(list: UndoStep[], present: Set<string>): boolean {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const step = list[index];

    if (inFlight(step)) return false;
    if (stillTrue(step, present)) return true;
  }

  return false;
}

/** The step to act on, and the stack with it and every moot one above it gone. */
function take(
  list: UndoStep[],
  present: Set<string>,
): { step: UndoStep | null; rest: UndoStep[] } {
  const rest = [...list];

  while (rest.length > 0) {
    const step = rest[rest.length - 1];

    // Wait for it rather than skipping past it: the order of a stack is the
    // order the gestures happened in, and stepping over one would take back
    // the wrong trace.
    if (inFlight(step)) return { step: null, rest: list };

    rest.pop();
    if (stillTrue(step, present)) return { step, rest };
  }

  return { step: null, rest };
}

export interface Undoing {
  canUndo: boolean;
  canRedo: boolean;
  /** True while a step is in flight, so a held-down Ctrl+Z queues nothing. */
  busy: boolean;
  /** Put one gesture of this browser's own on the stack. */
  remember: (step: UndoStep) => void;
  /** The commit answered: swap the optimistic id, or drop the step outright. */
  settle: (phaseId: string, localId: string, stroke: PlanStroke | null) => void;
  undo: () => void;
  redo: () => void;
}

export function useUndo({
  planId,
  squadId,
  phaseId,
  epoch,
  editable,
  strokes,
  draw,
  rub,
}: {
  planId: string;
  squadId: string | null;
  phaseId: string;
  epoch: number;
  editable: boolean;
  /** The phase's live traces — how «somebody else got there first» is noticed. */
  strokes: PlanStroke[];
  draw: (phaseId: string, stroke: PlanStroke) => void;
  rub: (phaseId: string, strokeId: string) => void;
}): Undoing {
  const t = useTranslations("Plans");

  const [stacks, setStacks] = useState<Record<string, Stack>>({});
  const [busy, setBusy] = useState(false);

  /**
   * The stack of the phase on screen — and only while the epoch it was built in
   * is still the phase's.
   *
   * Both invalidations live in this one `useMemo`. Keying by phase means
   * stepping the rail back and forth keeps every phase's own stack, which is
   * what somebody walking a briefing expects; comparing the epoch means a
   * phase that was emptied takes its stack with it, because the traces it
   * pointed at are not stale, they are gone.
   */
  const live = useMemo(() => {
    const held = stacks[phaseId];
    return held && held.epoch === epoch ? held : EMPTY;
  }, [stacks, phaseId, epoch]);

  const present = useMemo(
    () => new Set(strokes.map((stroke) => stroke.id)),
    [strokes],
  );

  const canUndo = editable && !busy && ready(live.undo, present);
  const canRedo = editable && !busy && ready(live.redo, present);

  const remember = useCallback((step: UndoStep) => {
    setStacks((current) => {
      const held = current[step.phaseId];
      const base =
        held && held.epoch === step.epoch ? held.undo : ([] as UndoStep[]);

      return {
        ...current,
        [step.phaseId]: {
          epoch: step.epoch,
          undo: [...base, step].slice(-DEPTH),
          // A new gesture is a new future: what was undone is not coming back.
          redo: [],
        },
      };
    });
  }, []);

  const settle = useCallback(
    (settledPhase: string, localId: string, stroke: PlanStroke | null) => {
      setStacks((current) => {
        const held = current[settledPhase];
        if (!held) return current;

        const fix = (list: UndoStep[]) =>
          stroke
            ? list.map((step) =>
                step.strokeId === localId
                  ? { ...step, strokeId: stroke.id, stroke }
                  : step,
              )
            : // The commit failed: the trace never existed, so there is
              // nothing to take back.
              list.filter((step) => step.strokeId !== localId);

        return {
          ...current,
          [settledPhase]: {
            ...held,
            undo: fix(held.undo),
            redo: fix(held.redo),
          },
        };
      });
    },
    [],
  );

  /**
   * Take one trace off the phase, or put it back, optimistically.
   *
   * A trace brought back is the **newest** thing on the phase: a revision is
   * what orders a drawing, and a resurrection under the old one would step
   * behind every cursor in the raid and reach nobody. So it is drawn on top and
   * the server's answer, carrying its real fresh revision, replaces it.
   */
  const perform = useCallback(
    async (step: UndoStep, off: boolean): Promise<"done" | "gone" | "failed"> => {
      if (off) rub(step.phaseId, step.strokeId);
      else
        draw(step.phaseId, {
          ...step.stroke,
          id: step.strokeId,
          deletedAt: null,
          rev: Number.MAX_SAFE_INTEGER,
        });

      try {
        const answer = off
          ? await planApi.erase(planId, step.phaseId, step.strokeId, squadId)
          : await planApi.restore(planId, step.phaseId, step.strokeId, squadId);

        if (!off) draw(step.phaseId, answer.stroke);

        return "done";
      } catch (error) {
        // Put the screen back: an optimistic change is never left standing on
        // a call that refused.
        if (off) draw(step.phaseId, step.stroke);
        else rub(step.phaseId, step.strokeId);

        // Genuinely gone — a leader's eraser, a deleted phase. Not worth
        // shouting about; the step simply stops existing.
        if (error instanceof PlanHttpError && error.status === 404) return "gone";

        toast.error(t("errorTitle"), {
          description: error instanceof Error ? error.message : undefined,
        });

        return "failed";
      }
    },
    [draw, planId, rub, squadId, t],
  );

  const walk = useCallback(
    async (backwards: boolean) => {
      if (!editable || busy) return;

      const from = backwards ? live.undo : live.redo;
      const chosen = take(from, present);

      // Nothing to do, but moot steps may have been shaken out on the way.
      if (!chosen.step) {
        if (chosen.rest.length !== from.length) {
          setStacks((current) => {
            const held = current[phaseId];
            if (!held || held.epoch !== epoch) return current;

            return {
              ...current,
              [phaseId]: backwards
                ? { ...held, undo: chosen.rest }
                : { ...held, redo: chosen.rest },
            };
          });
        }

        return;
      }

      const step = chosen.step;

      // Undoing a `draw` takes it off; undoing an `erase` puts it back. Redo is
      // the same sentence read the other way round.
      const off = backwards ? step.act === "draw" : step.act === "erase";

      setBusy(true);

      // Optimistically on the other stack, so a second press is a redo rather
      // than a repeat of what is still in flight.
      setStacks((current) => {
        const held = current[phaseId];
        if (!held || held.epoch !== epoch) return current;

        return {
          ...current,
          [phaseId]: backwards
            ? { ...held, undo: chosen.rest, redo: [...held.redo, step] }
            : { ...held, redo: chosen.rest, undo: [...held.undo, step] },
        };
      });

      const outcome = await perform(step, off);

      setBusy(false);

      if (outcome === "done") return;

      setStacks((current) => {
        const held = current[phaseId];
        if (!held || held.epoch !== epoch) return current;

        const without = (list: UndoStep[]) =>
          list.filter((one) => one !== step);

        // Refused: back where it came from, so the next press is a retry.
        // Gone: off both stacks, because there is nothing left to act on.
        if (outcome === "gone") {
          return {
            ...current,
            [phaseId]: {
              ...held,
              undo: without(held.undo),
              redo: without(held.redo),
            },
          };
        }

        return {
          ...current,
          [phaseId]: backwards
            ? { ...held, undo: [...chosen.rest, step], redo: without(held.redo) }
            : { ...held, redo: [...chosen.rest, step], undo: without(held.undo) },
        };
      });
    },
    [busy, editable, epoch, live.redo, live.undo, perform, phaseId, present],
  );

  const undo = useCallback(() => void walk(true), [walk]);
  const redo = useCallback(() => void walk(false), [walk]);

  /**
   * Ctrl/⌘+Z, and Ctrl/⌘+Maj+Z or Ctrl+Y the other way.
   *
   * On `window`, because the canvas is an `<svg>` nobody focuses — and guarded
   * on the target, because the brief panel and the label field are full of
   * inputs where `Ctrl+Z` belongs to the browser. Stealing it there would rub a
   * trace out while somebody was fixing a typo in a phase name.
   *
   * The handlers reach the listener through refs, so it is registered once
   * instead of on every keystroke that changes a stack. Writing a ref is not
   * writing state; nothing here breaks the rule at the top of the file.
   */
  const pressed = useRef({ undo, redo });

  useEffect(() => {
    pressed.current = { undo, redo };
  }, [undo, redo]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

      const target = event.target as HTMLElement | null;

      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA"
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;

      event.preventDefault();

      if (key === "y" || event.shiftKey) pressed.current.redo();
      else pressed.current.undo();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { canUndo, canRedo, busy, remember, settle, undo, redo };
}
