import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { Bars3Icon, BellIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { auth, signIn, signOut } from "@/auth";
import { ArrowLeftEndOnRectangleIcon } from "@heroicons/react/16/solid";
import db from "@/lib/db";
import { ObjectId } from "bson";
import Image from "next/image";
import Link from "next/link";
import {
  TopBarNavItem,
  TopBarNavMenuItem,
} from "@/components/topbar-components";
import { getTranslations } from "next-intl/server";

const navigation = [
  { name: "dashboard", href: "/", current: true },
  { name: "shopping", href: "/shopping" },
  { name: "crafting", href: "/crafting" },
  { name: "industry", href: "/industry" },
  { name: "reputation", href: "/reps" },
  { name: "organizations", href: "/orgs" },
];
const userNavigation = [
  { name: "myProfile", href: "/profile" },
  { name: "settings", href: "/settings" },
  {
    name: "signOut",
    action: async () => {
      "use server";

      await signOut();
    },
  },
];

export default async function Topbar() {
  const t = await getTranslations("TopBar");
  const session = await auth();

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

  return (
    <Disclosure as="header" className="bg-gray-800">
      <div className="mx-auto max-w-7xl px-2 sm:px-4 lg:divide-y lg:divide-gray-700 lg:px-8">
        <div className="relative flex h-16 justify-between">
          <div className="relative z-10 flex px-2 lg:px-0">
            <Link href="/" className="flex flex-shrink-0 items-center">
              <Image
                alt="Nexus Tools"
                src="/nexus_logo_square.png"
                className="h-8 w-auto"
                width={32}
                height={32}
              />
            </Link>
          </div>
          <div className="relative z-0 flex flex-1 items-center justify-center px-2 sm:absolute sm:inset-0">
            <div className="w-full sm:max-w-xs">
              <label htmlFor="search" className="sr-only">
                {t("search")}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <MagnifyingGlassIcon
                    aria-hidden="true"
                    className="h-5 w-5 text-gray-400"
                  />
                </div>
                <input
                  id="search"
                  name="search"
                  type="search"
                  placeholder={t("search")}
                  className="block w-full rounded-md border-0 bg-gray-700 py-1.5 pl-10 pr-3 text-gray-300 placeholder:text-gray-400 focus:bg-white focus:text-gray-900 focus:ring-0 focus:placeholder:text-gray-500 sm:text-sm/6"
                />
              </div>
            </div>
          </div>
          <div className="relative z-10 flex items-center lg:hidden">
            {/* Mobile menu button */}
            <DisclosureButton className="group relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white">
              <span className="absolute -inset-0.5" />
              <span className="sr-only">{t("openMenu")}</span>
              <Bars3Icon
                aria-hidden="true"
                className="block h-6 w-6 group-data-[open]:hidden"
              />
              <XMarkIcon
                aria-hidden="true"
                className="hidden h-6 w-6 group-data-[open]:block"
              />
            </DisclosureButton>
          </div>
          {user ? (
            <div className="hidden lg:relative lg:z-10 lg:ml-4 lg:flex lg:items-center">
              <button
                type="button"
                className="relative flex-shrink-0 rounded-full bg-gray-800 p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800"
              >
                <span className="absolute -inset-1.5" />
                <span className="sr-only">{t("readNotifications")}</span>
                <BellIcon aria-hidden="true" className="h-6 w-6" />
              </button>

              {/* Profile dropdown */}
              <Menu as="div" className="relative ml-4 flex-shrink-0">
                <div>
                  <MenuButton className="relative flex rounded-full bg-gray-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
                    <span className="absolute -inset-1.5" />
                    <span className="sr-only">{t("openUserMenu")}</span>
                    <Image
                      alt=""
                      src={user.avatar ?? "/avatar_empty.png"}
                      className="h-8 w-8 rounded-full"
                      width={50}
                      height={50}
                    />
                  </MenuButton>
                </div>
                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
                >
                  {userNavigation.map((item) => (
                    <MenuItem key={item.name}>
                      {item.href ? (
                        <a
                          href={item.href}
                          className="block px-4 py-2 text-sm text-gray-700 data-[focus]:bg-gray-100"
                        >
                          {t(`nav.${item.name}`)}
                        </a>
                      ) : (
                        <form
                          action={item.action}
                          className="block px-4 py-2 text-sm text-gray-700 data-[focus]:bg-gray-100"
                        >
                          <button>{t(`nav.${item.name}`)}</button>
                        </form>
                      )}
                    </MenuItem>
                  ))}
                </MenuItems>
              </Menu>
            </div>
          ) : (
            <div className="hidden lg:relative lg:z-10 lg:ml-4 lg:flex lg:items-center">
              <form
                action={async () => {
                  "use server";
                  await signIn();
                }}
              >
                <button
                  type="submit"
                  className="relative flex-shrink-0 rounded-full bg-gray-800 p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800"
                >
                  <span className="absolute -inset-1.5" />
                  <span className="sr-only">{t("nav.signIn")}</span>
                  <ArrowLeftEndOnRectangleIcon
                    aria-hidden="true"
                    className="h-6 w-6"
                  />
                </button>
              </form>
            </div>
          )}
        </div>
        <nav
          aria-label="Global"
          className="hidden lg:flex lg:space-x-8 lg:py-2"
        >
          {navigation.map((item) => (
            <TopBarNavItem
              name={t(`nav.${item.name}`)}
              href={item.href}
              key={item.name}
            />
          ))}
        </nav>
      </div>

      <DisclosurePanel as="nav" aria-label="Global" className="lg:hidden">
        <div className="space-y-1 px-2 pb-3 pt-2">
          {navigation.map((item) => (
            <TopBarNavMenuItem
              name={t(`nav.${item.name}`)}
              href={item.href}
              key={item.name}
            />
          ))}
        </div>
        <div className="border-t border-gray-700 pb-3 pt-4">
          {user ? (
            <>
              <div className="flex items-center px-4">
                <div className="flex-shrink-0">
                  <Image
                    alt=""
                    src={user.avatar ?? "/avatar_empty.png"}
                    className="h-10 w-10 rounded-full"
                    width={50}
                    height={50}
                  />
                </div>
                <div className="ml-3">
                  <div className="text-base font-medium text-white">
                    {user.name}
                  </div>
                  <div className="text-sm font-medium text-gray-400">
                    {user.email}
                  </div>
                </div>
                <button
                  type="button"
                  className="relative ml-auto flex-shrink-0 rounded-full bg-gray-800 p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800"
                >
                  <span className="absolute -inset-1.5" />
                  <span className="sr-only">Voir les notifications</span>
                  <BellIcon aria-hidden="true" className="h-6 w-6" />
                </button>
              </div>
              <div className="mt-3 space-y-1 px-2">
                {userNavigation.map((item) =>
                  item.href ? (
                    <DisclosureButton
                      key={item.name}
                      as="a"
                      href={item.href}
                      className="block rounded-md px-3 py-2 text-base font-medium text-gray-400 hover:bg-gray-700 hover:text-white"
                    >
                      {t(`nav.${item.name}`)}
                    </DisclosureButton>
                  ) : (
                    <form
                      key={item.name}
                      action={item.action}
                      className="rounded-md px-3 py-2 text-base font-medium text-gray-400 hover:bg-gray-700 hover:text-white"
                    >
                      <button type="submit" className="w-full text-left">
                        {t(`nav.${item.name}`)}
                      </button>
                    </form>
                  ),
                )}
              </div>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn();
              }}
              className="mt-3 space-y-1 px-2"
            >
              <button
                type="submit"
                className="w-full text-left rounded-md px-3 py-2 text-base font-medium text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                {t("nav.signIn")}
              </button>
            </form>
          )}
        </div>
      </DisclosurePanel>
    </Disclosure>
  );
}
