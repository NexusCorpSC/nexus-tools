"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** La navigation latérale du back-office ; une rangée défilante sur mobile. */
export function BoNav({
  shopId,
  counts,
}: {
  shopId: string;
  counts: { orders: number; listings: number; custom: number };
}) {
  const t = useTranslations("ShopBo.nav");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const base = `/shops/${shopId}/bo`;
  const custom = searchParams.get("type") === "custom";

  const links = [
    {
      href: `${base}/orders`,
      label: t("orders"),
      count: counts.orders,
      on: pathname.startsWith(`${base}/orders`) && !custom,
    },
    {
      href: `${base}/listings`,
      label: t("listings"),
      count: counts.listings,
      on: pathname.startsWith(`${base}/listings`),
    },
    {
      href: `${base}/orders?type=custom`,
      label: t("custom"),
      count: counts.custom,
      on: pathname.startsWith(`${base}/orders`) && custom,
    },
    {
      href: `${base}/sellers`,
      label: t("sellers"),
      on: pathname.startsWith(`${base}/sellers`),
    },
    {
      href: `${base}/profile`,
      label: t("profile"),
      on: pathname.startsWith(`${base}/profile`),
    },
  ];

  return (
    <nav
      aria-label={t("label")}
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
    >
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.on ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
            link.on
              ? "bg-[#0E4569] font-semibold text-[#CCE7FF]"
              : "text-[#C9E4FF] hover:bg-[#9ED0FF]/8",
          )}
        >
          {link.label}
          {link.count !== undefined && (
            <span className="rounded-full bg-[#9ED0FF]/12 px-2 font-mono text-xs">
              {link.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
