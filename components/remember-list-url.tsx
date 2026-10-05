"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberList } from "@/lib/list-url";

function Remember() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    rememberList(pathname, search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);

  return null;
}

/**
 * For a list whose page or view is chosen by links rather than in-page
 * filters (`?page=2`, `?view=past`): remembers it as left, so a `ListLink`
 * back to it reopens the same page.
 */
export function RememberListUrl() {
  return (
    <Suspense>
      <Remember />
    </Suspense>
  );
}
