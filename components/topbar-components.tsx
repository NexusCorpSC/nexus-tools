"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { DisclosureButton } from "@headlessui/react";

export function TopBarNavItem({ name, href }: { name: string; href: string }) {
  const pathname = usePathname();

  let isCurrent = false;
  if (pathname === "/" && href === "/") {
    isCurrent = true;
  } else if (href !== "/" && pathname.startsWith(href)) {
    isCurrent = true;
  }

  return (
    <Link
      key={name}
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        isCurrent
          ? "bg-gray-900 text-white"
          : "text-gray-300 hover:bg-gray-700 hover:text-white",
        "inline-flex items-center rounded-md px-3 py-2 text-sm font-medium",
      )}
    >
      {name}
    </Link>
  );
}

export function TopBarNavMenuItem({
  name,
  href,
}: {
  name: string;
  href: string;
}) {
  const pathname = usePathname();

  let isCurrent = false;
  if (pathname === "/" && href === "/") {
    isCurrent = true;
  } else if (href !== "/" && pathname.startsWith(href)) {
    isCurrent = true;
  }

  return (
    <DisclosureButton
      key={name}
      as={Link}
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        isCurrent
          ? "bg-gray-900 text-white"
          : "text-gray-300 hover:bg-gray-700 hover:text-white",
        "block rounded-md px-3 py-2 text-base font-medium",
      )}
    >
      {name}
    </DisclosureButton>
  );
}
