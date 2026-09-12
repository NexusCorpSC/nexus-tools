"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { Squad, SquadView } from "@/types/squad";
import { squadApi } from "./api";

/** How often the view is re-read while the page is on screen. */
const POLL_INTERVAL = 2_000;

/**
 * The squad, kept as fresh as polling allows, and the one way to change it.
 *
 * Polled only while the tab is visible — a phone in a pocket has no business
 * asking every two seconds — and never while a write is in flight, so an
 * answer sent before a tap cannot land after it. Every write answers the
 * whole view, which then replaces what was on screen.
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
  const [offline, setOffline] = useState(false);

  const recentre = useCallback(
    (next: SquadView, shown: Squad | null): SquadView => {
      const wanted = current ?? shown?.id ?? null;
      if (!next.squad || !wanted || next.squad.id === wanted) return next;

      const mine = next.raid?.squads.find((squad) => squad.id === wanted);
      return mine ? { ...next, squad: mine } : next;
    },
    [current],
  );

  // The poll, with the answer for a squad no longer chosen thrown away: the
  // reader switched while it was on the wire.
  useEffect(() => {
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (gone) return;

      if (document.visibilityState === "visible" && writingRef.current === 0) {
        try {
          const next = await squadApi.read(current);
          if (!gone) {
            setView((shown) => recentre(next, shown.squad));
            setOffline(false);
          }
        } catch {
          if (!gone) setOffline(true);
        }
      }

      if (!gone) timer = setTimeout(poll, POLL_INTERVAL);
    }

    timer = setTimeout(poll, POLL_INTERVAL);

    // Coming back to the tab reads at once rather than up to two seconds later.
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void poll();
    }

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      gone = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [current, recentre]);

  // Switching squads reads the new one straight away.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    let gone = false;
    void squadApi
      .read(current)
      .then((next) => {
        if (!gone) setView(next);
      })
      .catch(() => undefined);

    return () => {
      gone = true;
    };
  }, [current]);

  /**
   * One write. Errors are shown and swallowed: the row keeps its shape, and
   * the next poll says what the server thinks.
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
        setView((shown) => recentre(next, shown.squad));
        setOffline(false);
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
      }
    },
    [recentre, t],
  );

  return { view, run, busy: writing > 0, offline };
}
