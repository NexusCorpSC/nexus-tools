"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept in step with the viewport.
 *
 * `false` on the server and during hydration, whatever the screen: the server
 * cannot know it, and answering the same thing on both sides is what keeps
 * hydration from failing. So this is for what happens *after* a tap — which
 * container a picker opens in, which of two layouts may open it — never for
 * a layout the visitor sees on first paint. That one is decided by the
 * stylesheet's breakpoints (`sm:hidden`, `hidden sm:block`), which the server
 * renders correctly without knowing the screen.
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
