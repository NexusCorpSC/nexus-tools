import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { BellIcon } from "@heroicons/react/24/outline";
import { ArrowLeftEndOnRectangleIcon } from "@heroicons/react/16/solid";
import db from "@/lib/db";
import { ObjectId } from "bson";
import Image from "next/image";
import Link from "next/link";
import { ScratchPadPanel } from "@/components/scratch-pad-panel";
import { CategoryNav, MobileNav } from "@/components/nav/main-nav";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { countFriendsPlaying } from "@/lib/friends";

const userNavigation = [
  { name: "myProfile", href: "/profile" },
  { name: "myContributions", href: "/contributions" },
  { name: "settings", href: "/settings" },
] as const;

async function signOut() {
  "use server";

  await auth.api.signOut({
    headers: await headers(),
  });
}

const iconButton =
  "relative flex size-10 shrink-0 items-center justify-center rounded-full border border-[#9ED0FF]/20 bg-[#0B3A5A]/60 text-[#9ED0FF] hover:border-[#9ED0FF]/40 hover:text-[#CCE7FF] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60";

/**
 * One row: the logo (the way home), the menu's four categories, then what is
 * the reader's own. On a phone the categories fold into a drawer.
 *
 * No `backdrop-filter` on the header: it would make the header the containing
 * block of the menu's fixed backdrop, which would then no longer cover the
 * page.
 */
export default async function Topbar() {
  const t = await getTranslations("TopBar");
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user
    ? await db
        .db()
        .collection<{
          _id: ObjectId;
          name: string;
          avatar: string;
          email: string;
        }>("users")
        .findOne({ _id: new ObjectId(session?.user?.id) })
    : null;

  const friendsPlaying = user ? await countFriendsPlaying(user._id) : 0;

  return (
    <header className="relative z-40 border-b border-[#9ED0FF]/15 bg-gray-800">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:px-4 lg:px-8">
        <Link
          href="/"
          aria-label={t("home")}
          className="mr-1 flex shrink-0 items-center gap-2.5 rounded-lg p-1.5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60 lg:mr-4"
        >
          <Image
            alt=""
            src="/nexus_logo_square.png"
            className="size-8"
            width={32}
            height={32}
          />
          <span className="font-bold text-[#E3F1FF] md:hidden xl:inline">
            Nexus Tools
          </span>
        </Link>

        <CategoryNav friendsPlaying={friendsPlaying} />

        <div className="flex-1" />

        <div className="hidden w-52 shrink-0 xl:block 2xl:w-64">
          <label htmlFor="search" className="sr-only">
            {t("search")}
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon
                aria-hidden="true"
                className="h-5 w-5 text-[#9ED0FF]/55"
              />
            </div>
            <input
              id="search"
              name="search"
              type="search"
              placeholder={t("search")}
              className="block w-full rounded-lg border border-[#9ED0FF]/20 bg-[#0B3A5A]/60 py-1.5 pr-3 pl-10 text-[#CCE7FF] placeholder:text-[#9ED0FF]/45 focus:border-[#9ED0FF]/50 focus:bg-[#0B3A5A]/80 focus:ring-0 focus:placeholder:text-[#9ED0FF]/60 sm:text-sm/6"
            />
          </div>
        </div>

        {user ? (
          <>
            {friendsPlaying > 0 ? (
              <Link
                href="/profile#amis"
                className="hidden h-9 shrink-0 items-center gap-2 rounded-full bg-emerald-300/12 px-3 text-sm font-medium text-emerald-300 hover:bg-emerald-300/20 2xl:flex"
              >
                <span className="size-2 rounded-full bg-emerald-300" />
                {t("friendsPlaying", { count: friendsPlaying })}
              </Link>
            ) : null}

            {/* Scratch pad, opens a side panel from the right */}
            <ScratchPadPanel />

            <button type="button" className={`${iconButton} max-lg:hidden`}>
              <span className="sr-only">{t("readNotifications")}</span>
              <BellIcon aria-hidden="true" className="size-5.5" />
            </button>

            <Menu as="div" className="relative hidden shrink-0 md:block">
              <MenuButton className="relative flex rounded-full border border-[#9ED0FF]/20 bg-[#0B3A5A]/60 text-sm text-[#CCE7FF] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60">
                <span className="absolute -inset-1.5" />
                <span className="sr-only">{t("openUserMenu")}</span>
                <Image
                  alt=""
                  src={user.avatar ?? "/avatar_empty.png"}
                  className="size-9 rounded-full"
                  width={50}
                  height={50}
                />
              </MenuButton>
              <MenuItems
                transition
                className="absolute right-0 z-50 mt-2 w-52 origin-top-right rounded-lg border border-[#9ED0FF]/20 bg-[#0B3A5A]/95 py-1 shadow-xl shadow-black/20 ring-1 ring-[#9ED0FF]/10 backdrop-blur-md transition focus:outline-hidden data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
              >
                {userNavigation.map((item) => (
                  <MenuItem key={item.name}>
                    <Link
                      href={item.href}
                      className="block px-4 py-2.5 text-sm text-[#9ED0FF]/80 data-focus:bg-[#9ED0FF]/15 data-focus:text-[#CCE7FF]"
                    >
                      {t(`nav.${item.name}`)}
                    </Link>
                  </MenuItem>
                ))}
                <form action={signOut}>
                  <MenuItem>
                    <button
                      type="submit"
                      className="block w-full px-4 py-2.5 text-left text-sm text-[#9ED0FF]/80 data-focus:bg-[#9ED0FF]/15 data-focus:text-[#CCE7FF]"
                    >
                      {t("nav.signOut")}
                    </button>
                  </MenuItem>
                </form>
              </MenuItems>
            </Menu>
          </>
        ) : (
          <Link
            href="/login"
            className={`${iconButton} max-md:hidden`}
            aria-label={t("nav.signIn")}
          >
            <ArrowLeftEndOnRectangleIcon
              aria-hidden="true"
              className="size-5.5"
            />
          </Link>
        )}

        <MobileNav
          friendsPlaying={friendsPlaying}
          account={
            user
              ? {
                  name: user.name,
                  email: user.email,
                  avatar: user.avatar ?? null,
                }
              : null
          }
          signOut={signOut}
        />
      </div>
    </header>
  );
}
