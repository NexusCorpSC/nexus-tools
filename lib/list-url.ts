"use client";

import { useEffect, useSyncExternalStore } from "react";

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

function rememberList(pathname: string, url: string) {
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
