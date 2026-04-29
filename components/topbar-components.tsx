"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { DisclosureButton } from "@headlessui/react";

const navBaseClass =
  "inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 backdrop-blur-sm";

const navMobileBaseClass =
  "block rounded-lg border px-3 py-2 text-base font-medium transition-all duration-200 backdrop-blur-sm";

const navActiveClass =
  "border-[#9ED0FF]/40 bg-[#9ED0FF]/20 text-[#CCE7FF] shadow-[0_0_0_1px_rgba(158,208,255,0.25)]";

const navInactiveClass =
  "border-transparent text-[#9ED0FF]/75 hover:border-[#9ED0FF]/25 hover:bg-[#9ED0FF]/10 hover:text-[#CCE7FF]";

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
        navBaseClass,
        isCurrent ? navActiveClass : navInactiveClass,
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
        navMobileBaseClass,
        isCurrent ? navActiveClass : navInactiveClass,
      )}
    >
      {name}
    </DisclosureButton>
  );
}
