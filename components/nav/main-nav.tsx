"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CloseButton,
  Dialog,
  DialogPanel,
  DialogTitle,
  Popover,
  PopoverBackdrop,
  PopoverButton,
  PopoverGroup,
  PopoverPanel,
} from "@headlessui/react";
import { ChevronDown, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  currentNavItem,
  NAV_CATEGORIES,
  type NavCategory,
  type NavItem,
} from "@/components/nav/navigation";

/**
 * The menu, from a tablet up: four categories in the bar, each opening a
 * panel of its pages under it.
 *
 * Opened by a click or a tap, never on hover — a hover menu cannot be used on
 * an iPad — and closed by a click outside, Escape, or following a link.
 */
export function CategoryNav({ friendsPlaying }: { friendsPlaying: number }) {
  const t = useTranslations("TopBar.menu");
  const current = currentNavItem(usePathname());

  return (
    <PopoverGroup
      as="nav"
      aria-label={t("label")}
      className="hidden items-center gap-0.5 md:flex"
    >
      {NAV_CATEGORIES.map((category) => {
        const holdsCurrent = current?.category.id === category.id;
        const Icon = category.icon;

        return (
          <Popover key={category.id}>
            <PopoverButton
              className={cn(
                "group relative flex h-11 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium whitespace-nowrap transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60 lg:px-3",
                "data-open:border-[#9ED0FF]/40 data-open:bg-[#9ED0FF]/15 data-open:text-[#E3F1FF]",
                holdsCurrent
                  ? "border-transparent text-[#E3F1FF]"
                  : "border-transparent text-[#A9CDEE] hover:bg-[#9ED0FF]/8 hover:text-[#E3F1FF]",
              )}
            >
              <span className="relative">
                <Icon className="size-4.5" aria-hidden />
                {category.id === "community" && friendsPlaying > 0 ? (
                  <span className="absolute -top-1 -right-1 size-2 rounded-full border-2 border-gray-800 bg-emerald-300" />
                ) : null}
              </span>
              {t(`categories.${category.id}.label`)}
              <ChevronDown
                aria-hidden
                className="hidden size-3.5 opacity-70 transition-transform group-data-open:rotate-180 lg:block"
              />
              {holdsCurrent ? (
                <span className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-[#9ED0FF]" />
              ) : null}
            </PopoverButton>

            <PopoverBackdrop className="fixed inset-x-0 top-16 bottom-0 bg-[#041422]/55" />

            <PopoverPanel className="absolute inset-x-0 top-full z-50 px-2 pt-2 sm:px-4 lg:px-8">
              <CategoryPanel
                category={category}
                currentItem={current?.item.id ?? null}
                friendsPlaying={friendsPlaying}
              />
            </PopoverPanel>
          </Popover>
        );
      })}
    </PopoverGroup>
  );
}

function CategoryPanel({
  category,
  currentItem,
  friendsPlaying,
}: {
  category: NavCategory;
  currentItem: string | null;
  friendsPlaying: number;
}) {
  const t = useTranslations("TopBar.menu");
  const Icon = category.icon;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 rounded-2xl border border-[#9ED0FF]/18 bg-[#0E2C45] p-4 shadow-2xl shadow-black/40 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 lg:p-7">
      <div className="flex items-baseline justify-between gap-4 px-1 lg:flex-col lg:justify-start lg:gap-2.5 lg:border-r lg:border-[#9ED0FF]/12 lg:pr-7">
        <span className="hidden size-11 items-center justify-center rounded-xl bg-[#9ED0FF]/12 text-[#9ED0FF] lg:flex">
          <Icon className="size-5.5" aria-hidden />
        </span>
        <span className="text-xl font-bold text-[#E3F1FF]">
          {t(`categories.${category.id}.label`)}
        </span>
        <span className="text-right text-sm text-[#A9CDEE] lg:text-left lg:leading-relaxed">
          {t(`categories.${category.id}.blurb`)}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-1.5">
        {category.items.map((item) => (
          <li key={item.id}>
            <CloseButton
              as={Link}
              href={item.href}
              aria-current={item.id === currentItem ? "page" : undefined}
              className={cn(
                "flex min-h-16 items-center gap-3.5 rounded-xl px-3.5 py-2.5 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60 md:min-h-18 lg:min-h-16",
                item.id === currentItem
                  ? "bg-[#9ED0FF]/14 ring-1 ring-[#9ED0FF]/30 ring-inset"
                  : "bg-[#9ED0FF]/4 hover:bg-[#9ED0FF]/10 lg:bg-transparent",
              )}
            >
              <ItemIcon item={item} current={item.id === currentItem} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold text-[#E3F1FF]">
                  {t(`items.${item.id}.label`)}
                  <FriendsBadge item={item} count={friendsPlaying} />
                </span>
                <span className="block truncate text-sm text-[#A9CDEE]">
                  {t(`items.${item.id}.description`)}
                </span>
              </span>
            </CloseButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemIcon({ item, current }: { item: NavItem; current: boolean }) {
  const Icon = item.icon;
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg md:size-11 lg:size-10",
        current
          ? "bg-[#CCE7FF] text-[#092F49]"
          : "bg-[#9ED0FF]/10 text-[#9ED0FF]",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

function FriendsBadge({ item, count }: { item: NavItem; count: number }) {
  const t = useTranslations("TopBar.menu");
  if (item.id !== "friends" || count === 0) return null;

  return (
    <span className="rounded-full bg-emerald-300/14 px-2 py-px text-xs font-medium text-emerald-300">
      {t("playing", { count })}
    </span>
  );
}

type Account = { name: string; email: string; avatar: string | null };

/**
 * The menu on a phone: a drawer with every page, grouped as in the bar, and
 * the account at the foot.
 */
export function MobileNav({
  friendsPlaying,
  account,
  signOut,
}: {
  friendsPlaying: number;
  account: Account | null;
  signOut: () => Promise<void>;
}) {
  const t = useTranslations("TopBar");
  const [open, setOpen] = useState(false);
  const current = currentNavItem(usePathname());

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        className="flex size-11 items-center justify-center rounded-lg border border-[#9ED0FF]/20 bg-[#0B3A5A]/60 text-[#9ED0FF] hover:border-[#9ED0FF]/40 hover:text-[#CCE7FF] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60 md:hidden"
      >
        <Menu className="size-5.5" aria-hidden />
      </button>

      <Dialog open={open} onClose={close} className="relative z-50 md:hidden">
        <DialogPanel className="fixed inset-0 overflow-y-auto bg-[#0E2C45] text-[#E3F1FF]">
          <div className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-[#9ED0FF]/14 bg-gray-800 px-4">
            <Image
              alt=""
              src="/nexus_logo_square.png"
              className="size-8"
              width={32}
              height={32}
            />
            <DialogTitle className="flex-1 font-bold">Nexus Tools</DialogTitle>
            <button
              type="button"
              onClick={close}
              aria-label={t("closeMenu")}
              className="flex size-11 items-center justify-center rounded-lg border border-[#9ED0FF]/30 bg-[#9ED0FF]/12 text-[#E3F1FF] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <nav aria-label={t("menu.label")} className="space-y-6 px-4 py-5">
            {NAV_CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <section key={category.id} className="space-y-0.5">
                  <h2 className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold tracking-widest text-[#86AED2] uppercase">
                    <Icon className="size-4" aria-hidden />
                    {t(`menu.categories.${category.id}.label`)}
                  </h2>
                  {category.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isCurrent = current?.item.id === item.id;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={close}
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "flex min-h-12 items-center gap-3.5 rounded-xl px-3 text-base font-medium",
                          isCurrent
                            ? "bg-[#9ED0FF]/14 font-semibold ring-1 ring-[#9ED0FF]/30 ring-inset"
                            : "hover:bg-[#9ED0FF]/8",
                        )}
                      >
                        <ItemIcon
                          aria-hidden
                          className={cn(
                            "size-5 shrink-0",
                            isCurrent ? "text-[#E3F1FF]" : "text-[#9ED0FF]",
                          )}
                        />
                        <span className="flex-1">
                          {t(`menu.items.${item.id}.label`)}
                        </span>
                        <FriendsBadge item={item} count={friendsPlaying} />
                      </Link>
                    );
                  })}
                </section>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-[#9ED0FF]/12 px-4 pt-4 pb-8">
            {account ? (
              <>
                <div className="flex items-center gap-3">
                  <Image
                    alt=""
                    src={account.avatar ?? "/avatar_empty.png"}
                    className="size-10 rounded-full"
                    width={40}
                    height={40}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{account.name}</p>
                    <p className="truncate text-sm text-[#A9CDEE]">
                      {account.email}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/profile"
                    onClick={close}
                    className="flex h-11 items-center justify-center rounded-lg border border-[#9ED0FF]/25 text-sm font-medium text-[#CCE7FF] hover:bg-[#9ED0FF]/10"
                  >
                    {t("nav.myProfile")}
                  </Link>
                  <Link
                    href="/settings"
                    onClick={close}
                    className="flex h-11 items-center justify-center rounded-lg border border-[#9ED0FF]/25 text-sm font-medium text-[#CCE7FF] hover:bg-[#9ED0FF]/10"
                  >
                    {t("nav.settings")}
                  </Link>
                  <Link
                    href="/contributions"
                    onClick={close}
                    className="col-span-2 flex h-11 items-center justify-center rounded-lg border border-[#9ED0FF]/25 text-sm font-medium text-[#CCE7FF] hover:bg-[#9ED0FF]/10"
                  >
                    {t("nav.myContributions")}
                  </Link>
                </div>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="h-11 w-full rounded-lg text-sm text-[#A9CDEE] hover:bg-[#9ED0FF]/8 hover:text-[#E3F1FF]"
                  >
                    {t("nav.signOut")}
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                onClick={close}
                className="flex h-11 items-center justify-center rounded-lg bg-[#CCE7FF] text-sm font-semibold text-[#092F49]"
              >
                {t("nav.signIn")}
              </Link>
            )}
          </div>
        </DialogPanel>
      </Dialog>
    </>
  );
}
