"use client";

import { useEffect, useRef, useState } from "react";
import { EVENT_NAMES, EVENTS_PATH, type EventTopic } from "@/types/events";

/**
 * One `EventSource` on `/api/events`, for the topics a page shows.
 *
 * Open only while the tab is visible — a phone in a pocket has no business
 * holding a connection — and reopened when it comes back, which brings a fresh
 * snapshot of every topic. The browser reconnects on its own after a drop or
 * after the server's `bye`; what it does not retry is a definitive refusal
 * (401, 404, a 5xx), where `readyState` goes to `CLOSED` and the hook tries
 * again by itself a few seconds later.
 *
 * `offline` is not raised on every hiccup: a reconnection that succeeds within
 * a moment — the rollover the server does every few minutes — would only make
 * an icon blink. It is raised when the browser has given up, or when a
 * reconnection is still not through after a while.
 */

/** How long a reconnection may take before the page says it is offline. */
const SLOW_RECONNECT_MS = 3_000;

/** How long to wait before retrying a connection the browser gave up on. */
const RETRY_MS = 5_000;

export interface EventStreamOptions {
  topics: readonly EventTopic[];
  /** The squad topic's parameter, `null` for the API's pick. */
  squad?: string | null;
  enabled?: boolean;
  onEvent: (topic: EventTopic, data: unknown) => void;
}

function urlFor(topics: readonly EventTopic[], squad: string | null): string {
  const params = new URLSearchParams();
  params.set("topics", topics.join(","));
  if (squad) params.set("squad", squad);
  return `${EVENTS_PATH}?${params.toString()}`;
}

export function useEventStream({
  topics,
  squad = null,
  enabled = true,
  onEvent,
}: EventStreamOptions): { offline: boolean } {
  const [offline, setOffline] = useState(false);

  // The latest handler, so the effect below does not reopen the stream every
  // time the caller re-renders with a new closure.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const topicsKey = topics.join(",");

  useEffect(() => {
    // Nothing to follow is not a stream to open: `topics=` with nothing after
    // it is a request the server refuses, and a listener for no event.
    const wanted = topicsKey ? (topicsKey.split(",") as EventTopic[]) : [];

    if (!enabled || wanted.length === 0) {
      setOffline(false);
      return;
    }

    const url = urlFor(wanted, squad);

    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let slow: ReturnType<typeof setTimeout> | null = null;
    let gone = false;

    function clearTimers() {
      if (retry) clearTimeout(retry);
      if (slow) clearTimeout(slow);
      retry = null;
      slow = null;
    }

    function close() {
      clearTimers();
      source?.close();
      source = null;
    }

    function open() {
      if (gone || document.visibilityState !== "visible") return;
      close();

      const stream = new EventSource(url);
      source = stream;

      for (const topic of topicsKey.split(",") as EventTopic[]) {
        stream.addEventListener(EVENT_NAMES[topic], (message) => {
          let data: unknown;
          try {
            data = JSON.parse((message as MessageEvent<string>).data);
          } catch {
            return;
          }
          onEventRef.current(topic, data);
        });
      }

      stream.onopen = () => {
        if (slow) clearTimeout(slow);
        slow = null;
        setOffline(false);
      };

      stream.onerror = () => {
        if (source !== stream) return;

        if (stream.readyState === EventSource.CLOSED) {
          // Refused outright: the browser will not try again, so we do.
          setOffline(true);
          if (!retry) {
            retry = setTimeout(() => {
              retry = null;
              open();
            }, RETRY_MS);
          }
          return;
        }

        // Reconnecting on its own. Only a slow one is worth showing.
        slow ??= setTimeout(() => {
          slow = null;
          setOffline(true);
        }, SLOW_RECONNECT_MS);
      };
    }

    function onVisibility() {
      if (document.visibilityState === "visible") open();
      else close();
    }

    open();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [enabled, topicsKey, squad]);

  return { offline };
}
