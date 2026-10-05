"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { markListReturn, useLastListUrl } from "@/lib/list-url";

/**
 * A link to a list (`/items`, `/lieux`…) that reopens it as it was last left
 * in this tab, filters, page and scroll included. For breadcrumbs and "back"
 * links.
 */
export function ListLink({
  href,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const url = useLastListUrl(href);
  return (
    <Link
      href={url}
      onClick={(event) => {
        markListReturn();
        onClick?.(event);
      }}
      {...props}
    />
  );
}
