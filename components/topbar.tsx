import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
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
  TopBarSearch,
} from "@/components/topbar-components";

const navigation = [
  { name: "Dashboard", href: "/", current: true },
  { name: "Shopping", href: "/shopping" },
  { name: "Crafting", href: "/crafting" },
];
const userNavigation = [
  { name: "Mon Profil", href: "/profile" },
  { name: "Paramètres", href: "/settings" },
  {
    name: "Déconnexion",
    action: async () => {
      "use server";

      await signOut();
    },
  },
];

export default async function Topbar() {
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
            <TopBarSearch />
          </div>
          <div className="relative z-10 flex items-center lg:hidden">
            {/* Mobile menu button */}
            <DisclosureButton className="group relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white">
              <span className="absolute -inset-0.5" />
              <span className="sr-only">Ouvrir le menu</span>
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
                <span className="sr-only">Voir les notifications</span>
                <BellIcon aria-hidden="true" className="h-6 w-6" />
              </button>

              {/* Profile dropdown */}
              <Menu as="div" className="relative ml-4 flex-shrink-0">
                <div>
                  <MenuButton className="relative flex rounded-full bg-gray-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
                    <span className="absolute -inset-1.5" />
                    <span className="sr-only">Ouvrir le menu utilisateur</span>
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
                          {item.name}
                        </a>
                      ) : (
                        <form
                          action={item.action}
                          className="block px-4 py-2 text-sm text-gray-700 data-[focus]:bg-gray-100"
                        >
                          <button>{item.name}</button>
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
                  <span className="sr-only">Connexion</span>
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
            <TopBarNavItem name={item.name} href={item.href} key={item.name} />
          ))}
        </nav>
      </div>

      <DisclosurePanel as="nav" aria-label="Global" className="lg:hidden">
        <div className="space-y-1 px-2 pb-3 pt-2">
          {navigation.map((item) => (
            <TopBarNavMenuItem
              name={item.name}
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
                      {item.name}
                    </DisclosureButton>
                  ) : (
                    <form
                      key={item.name}
                      action={item.action}
                      className="rounded-md px-3 py-2 text-base font-medium text-gray-400 hover:bg-gray-700 hover:text-white"
                    >
                      <button type="submit" className="w-full text-left">
                        {item.name}
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
                Connexion
              </button>
            </form>
          )}
        </div>
      </DisclosurePanel>
    </Disclosure>
  );
}
