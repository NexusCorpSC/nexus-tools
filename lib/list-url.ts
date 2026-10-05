"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

type QueryValue = string | number | boolean | null | undefined;

const STORAGE_PREFIX = "nexus:list:";

function isEmpty(key: string, value: QueryValue): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    value === false ||
    (key === "page" && Number(value) <= 1)
  );
}

/**
 * Rewrites some keys of the address's query in place, without a navigation:
 * the history entry keeps them, so "back" from a detail page finds the list as
 * it was left. Empty values, `false` and page 1 are removed.
 *
 * `history.replaceState` is synced with Next's router (`useSearchParams`
 * follows it) and, unlike `router.replace`, re-renders no server component.
 */
export function replaceQuery(values: Record<string, QueryValue>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(values)) {
    if (isEmpty(key, value)) params.delete(key);
    else params.set(key, String(value));
  }
  const search = params.toString();
  const { pathname } = window.location;
  const url = search ? `${pathname}?${search}` : pathname;

  if (url !== `${pathname}${window.location.search}`) {
    window.history.replaceState(window.history.state, "", url);
  }
  rememberList(pathname, url);
}

/** Remembers `url` as the list at `pathname` last left in this tab. */
export function rememberList(pathname: string, url: string) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + pathname, url);
  } catch {
    // Private mode or storage off: links simply lead to the bare list.
  }
}

/** The list at `pathname` as last left in this tab, filters included. */
export function lastListUrl(pathname: string): string {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + pathname) ?? pathname;
  } catch {
    return pathname;
  }
}

/**
 * Keeps a list's filters in the address. The component still holds them in
 * state, seeded from `useSearchParams()`; this writes each change back.
 */
export function useUrlFilters(values: Record<string, QueryValue>) {
  const serialized = JSON.stringify(values);

  useEffect(() => {
    replaceQuery(JSON.parse(serialized));
  }, [serialized]);
}

/**
 * `pathname` as last left in this tab, for a link back to a list. The bare
 * path on the server and on the first render, so hydration matches.
 */
export function useLastListUrl(pathname: string): string {
  return useSyncExternalStore(
    subscribeNever,
    () => lastListUrl(pathname),
    () => pathname,
  );
}

/** Session storage only changes from the list itself, never under a link. */
function subscribeNever() {
  return () => {};
}

/** Reads a numeric `page`: 1 when absent or invalid. */
export function pageFrom(params: { get(key: string): string | null }): number {
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

const SCROLL_PREFIX = "nexus:scroll:";
/** How long after a "back" or a list link the list counts as being returned to. */
const RETURN_WINDOW_MS = 2000;
let returnedAt = 0;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    returnedAt = Date.now();
  });
}

/** Marks the next list to open as a return, so it scrolls back where it was. */
export function markListReturn() {
  returnedAt = Date.now();
}

/**
 * Brings a list back to where it was scrolled when the reader returns to it
 * (browser "back", or a breadcrumb / "back" link). The list loads its results
 * after mounting, so the scroll waits for `ready`. Opening the list any other
 * way starts at the top, as before.
 */
export function useScrollRestore(ready: boolean) {
  const restored = useRef(false);
  const returning = useRef(false);

  useEffect(() => {
    returning.current = Date.now() - returnedAt < RETURN_WINDOW_MS;
    const { pathname } = window.location;
    const key = SCROLL_PREFIX + pathname;
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Leaving for another page scrolls it to the top: not this list's.
        if (window.location.pathname !== pathname) return;
        try {
          sessionStorage.setItem(key, String(Math.round(window.scrollY)));
        } catch {
          // Storage off: the list simply opens at the top.
        }
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
    };
  }, []);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    if (!returning.current) return;
    let top = 0;
    try {
      top = Number(
        sessionStorage.getItem(SCROLL_PREFIX + window.location.pathname) ?? 0,
      );
    } catch {
      return;
    }
    if (top > 0) requestAnimationFrame(() => window.scrollTo(0, top));
  }, [ready]);
}
