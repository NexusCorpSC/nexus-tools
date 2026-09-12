"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { Squad, SquadView } from "@/types/squad";
import { useEventStream } from "@/lib/use-event-stream";

/**
 * The squad, kept fresh by the event stream, and the one way to change it.
 *
 * The view arrives over `/api/events`: a snapshot when the stream opens, then
 * one every time a squad or raid the reader depends on is written. Every write
 * answers the whole view too, which then replaces what was on screen.
 *
 * Two orderings have to hold between the two sources:
 *
 * - a push is never applied while a write is in flight — it is *held*, and the
 *   last one held is applied once the write's own answer has landed — so an
 *   answer sent before a tap cannot land after it;
 * - a push older than what is on screen is dropped: the squad's `version`
 *   grows with every write, and a view that carries a smaller one for the same
 *   squad was read before something the screen already shows.
 *
 * `current` is the squad the page chose to look at, `null` for the one the
 * API picks. A write may act on *another* squad of the raid — an organiser
 * toggling a row of the Bravo they opened — and answer with Bravo as `squad`;
 * the view is then re-centred on the squad the page was showing rather than
 * switched under the reader's thumb.
 */
export function useSquadView(initial: SquadView, current: string | null) {
  const t = useTranslations("Squads");
  const [view, setView] = useState<SquadView>(initial);
  const [writing, setWriting] = useState(0);
  const writingRef = useRef(0);

  const recentre = useCallback(
    (next: SquadView, shown: Squad | null): SquadView => {
      const wanted = current ?? shown?.id ?? null;
      if (!next.squad || !wanted || next.squad.id === wanted) return next;

      const mine = next.raid?.squads.find((squad) => squad.id === wanted);
      return mine ? { ...next, squad: mine } : next;
    },
    [current],
  );

  /** What replaces the screen, unless it is older than the screen. */
  const merge = useCallback(
    (next: SquadView, shown: SquadView): SquadView => {
      if (
        next.squad &&
        shown.squad &&
        next.squad.id === shown.squad.id &&
        next.squad.version < shown.squad.version
      ) {
        return shown;
      }

      return recentre(next, shown.squad);
    },
    [recentre],
  );

  /** The last push that arrived while a write was in flight. */
  const held = useRef<SquadView | null>(null);

  const onEvent = useCallback(
    (_topic: unknown, data: unknown) => {
      const next = data as SquadView;

      if (writingRef.current > 0) {
        held.current = next;
        return;
      }

      setView((shown) => merge(next, shown));
    },
    [merge],
  );

  const { offline } = useEventStream({
    topics: ["squad"],
    squad: current,
    onEvent,
  });

  /**
   * One write. Errors are shown and swallowed: the row keeps its shape, and
   * the next push says what the server thinks.
   */
  const run = useCallback(
    async (
      write: () => Promise<SquadView>,
      options?: { then?: (view: SquadView) => void },
    ): Promise<boolean> => {
      writingRef.current += 1;
      setWriting((count) => count + 1);

      try {
        const next = await write();
        setView((shown) => merge(next, shown));
        options?.then?.(next);
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
          setView((shown) => merge(pushed, shown));
        }
      }
    },
    [merge, t],
  );

  return { view, run, busy: writing > 0, offline };
}
