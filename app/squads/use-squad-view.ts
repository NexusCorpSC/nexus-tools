"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { PlanFeed, PlanSummary } from "@/types/plan";
import type { Squad, SquadView } from "@/types/squad";
import { useEventStream } from "@/lib/use-event-stream";
import { squadApi } from "./api";

/** A ready check waits for an answer: long enough to notice, not forever. */
const READY_CHECK_TOAST_MS = 60_000;

type Run = (
  write: () => Promise<SquadView>,
  options?: { then?: (view: SquadView) => void },
) => Promise<boolean>;

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
 *
 * `userId` is the reader: a ready check pushed for the squad or the raid on
 * screen becomes a toast whose «Prêt» button writes their own row.
 */
export function useSquadView(
  initial: SquadView,
  initialPlans: PlanSummary[],
  current: string | null,
  userId: string,
) {
  const t = useTranslations("Squads");
  const [view, setView] = useState<SquadView>(initial);
  const [writing, setWriting] = useState(0);
  const writingRef = useRef(0);

  // What is on screen, readable outside a render: a push is compared with it
  // before it replaces it, and a toast is raised from that comparison — which
  // is a side effect, and has no place inside a state updater.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const commit = useCallback((next: SquadView) => {
    viewRef.current = next;
    setView(next);
  }, []);

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

  // `run` answers a ready check, and a ready check is noticed by applying a
  // push, which `run` also does once a write settles: the two reach each
  // other through refs rather than through each other's definitions.
  const runRef = useRef<Run | null>(null);
  const applyRef = useRef<(next: SquadView) => void>(() => undefined);

  /**
   * A ready check the push carries and the screen did not: a toast, with the
   * one answer it asks for. The squad's own, or the raid's — told apart by
   * where the new id sits. Our own request lands through `run` first, so the
   * push that echoes it finds the id already known.
   *
   * The two answers are not the same write. A squad check asks one squad, and
   * is answered on that row. A raid check asks the raid, and a reader in two of
   * its squads owes an answer in both — so it goes to the route that fills
   * every row they hold in the raid, rather than the one the screen happens to
   * be showing.
   */
  const noticeReadyCheck = useCallback(
    (shown: SquadView, next: SquadView) => {
      const squad = next.squad;
      if (!squad || shown.squad?.id !== squad.id) return;

      const squadCheck = squad.readyCheck;
      if (squadCheck && squadCheck.id !== shown.squad?.readyCheck?.id) {
        toast(t("readyCheckTitle", { name: squad.name }), {
          description: t("readyCheckBody", { by: squadCheck.requestedBy }),
          duration: READY_CHECK_TOAST_MS,
          action: {
            label: t("ready"),
            onClick: () =>
              void runRef.current?.(() =>
                squadApi.patchMember(squad.id, userId, { ready: true }),
              ),
          },
        });
      }

      const raidCheck = next.raid?.readyCheck;
      if (
        next.raid &&
        raidCheck &&
        shown.raid?.id === next.raid.id &&
        raidCheck.id !== shown.raid.readyCheck?.id
      ) {
        toast(t("readyCheckTitle", { name: next.raid.name }), {
          description: t("readyCheckBody", { by: raidCheck.requestedBy }),
          duration: READY_CHECK_TOAST_MS,
          action: {
            label: t("ready"),
            onClick: () =>
              void runRef.current?.(() => squadApi.answerRaidReady(squad.id)),
          },
        });
      }
    },
    [t, userId],
  );

  /**
   * What the stream delivered, applied — and read for what it announces.
   * Read as merged, not as pushed: a view re-centred on the squad on screen is
   * still a new view, and what it announces is what the screen now shows.
   */
  const apply = useCallback(
    (next: SquadView) => {
      const shown = viewRef.current;
      const merged = merge(next, shown);
      if (merged !== shown) noticeReadyCheck(shown, merged);
      commit(merged);
    },
    [commit, merge, noticeReadyCheck],
  );
  applyRef.current = apply;

  /**
   * One write. Errors are shown and swallowed: the row keeps its shape, and
   * the next push says what the server thinks.
   */
  const run = useCallback<Run>(
    async (write, options) => {
      writingRef.current += 1;
      setWriting((count) => count + 1);

      try {
        const next = await write();
        commit(merge(next, viewRef.current));
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
          applyRef.current(pushed);
        }
      }
    },
    [commit, merge, t],
  );
  runRef.current = run;

  /**
   * The squad's plans de vol, which the board shows a card for.
   *
   * On this stream rather than one of its own: every reader of `/squads` would
   * otherwise hold two connections, and the second would carry a kilobyte of
   * plan names. The hook is the squad's, the topic is not — but the page is,
   * and one connection per page is the whole point of the event hub.
   */
  const [plans, setPlans] = useState(initialPlans);

  const onEvent = useCallback(
    (topic: unknown, data: unknown) => {
      if (topic === "plan") {
        setPlans((data as PlanFeed).plans);
        return;
      }

      const next = data as SquadView;

      if (writingRef.current > 0) {
        held.current = next;
        return;
      }

      apply(next);
    },
    [apply],
  );

  const { offline } = useEventStream({
    topics: ["squad", "plan"],
    squad: current,
    onEvent,
  });

  return { view, plans, run, busy: writing > 0, offline };
}
