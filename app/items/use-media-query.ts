"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept in step with the viewport.
 *
 * `false` on the server and during hydration: nothing here decides the first
 * paint of anything the visitor sees before touching it, so a mismatch costs
 * one re-render and never a hydration error.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's `sm` breakpoint, from below: a phone, held upright. */
export const PHONE_QUERY = "(max-width: 639px)";
