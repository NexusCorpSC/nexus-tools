"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { DisclosureButton } from "@headlessui/react";
import { useEffect, useState } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import {
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/20/solid";
import { UsersIcon } from "@heroicons/react/24/outline";

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

const people = [
  {
    id: 1,
    name: "Leslie Alexander",
    phone: "1-493-747-9031",
    email: "lesliealexander@example.com",
    role: "Co-Founder / CEO",
    url: "https://example.com",
    profileUrl: "#",
    imageUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
  },
  // More people...
];

const recent = [people[0]];

export function TopBarSearch() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);

  async function makeSearch(search: string) {
    console.log(`Searching for: ${search}`);

    const url = new URL("/api/search", window.location.origin);
    url.searchParams.append("q", search);

    const itemsResponse = await fetch(url);

    if (itemsResponse.ok) {
      const items = await itemsResponse.json();

      console.log(items);

      setResults(people);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (search && search.length >= 1) {
        makeSearch(search);
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [search]);

  return (
    <div className="overflow-y-auto">
      <div className="mx-auto max-w-3xl transform divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 transition-all data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in">
        <Combobox
          onChange={(person) => {
            if (person) {
              window.location = person.url;
            }
          }}
        >
          {({ activeOption }) => (
            <>
              <div className="grid grid-cols-1">
                <ComboboxInput
                  autoFocus
                  className="col-start-1 row-start-1 h-12 w-full pl-11 pr-4 text-base text-gray-900 outline-none placeholder:text-gray-400 sm:text-sm"
                  placeholder="Search..."
                  onChange={(event) => setSearch(event.target.value)}
                  onBlur={() => setSearch("")}
                />
                <MagnifyingGlassIcon
                  className="pointer-events-none col-start-1 row-start-1 ml-4 size-5 self-center text-gray-400"
                  aria-hidden="true"
                />
              </div>

              {search !== "" && results.length > 0 && (
                <ComboboxOptions
                  as="div"
                  static
                  hold
                  className="flex transform-gpu divide-x divide-gray-100"
                >
                  <div
                    className={cn(
                      "max-h-96 min-w-0 flex-auto scroll-py-4 overflow-y-auto px-6 py-4",
                      activeOption && "sm:h-96",
                    )}
                  >
                    {search === "" && (
                      <h2 className="mb-4 mt-2 text-xs font-semibold text-gray-500">
                        Recent searches
                      </h2>
                    )}
                    <div className="-mx-2 text-sm text-gray-700">
                      {(search === "" ? recent : results).map((person) => (
                        <ComboboxOption
                          as="div"
                          key={person.id}
                          value={person}
                          className="group flex cursor-default select-none items-center rounded-md p-2 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 data-[focus]:outline-none"
                        >
                          <img
                            src={person.imageUrl}
                            alt=""
                            className="size-6 flex-none rounded-full"
                          />
                          <span className="ml-3 flex-auto truncate">
                            {person.name}
                          </span>
                          <ChevronRightIcon
                            className="ml-3 hidden size-5 flex-none text-gray-400 group-data-[focus]:block"
                            aria-hidden="true"
                          />
                        </ComboboxOption>
                      ))}
                    </div>
                  </div>

                  {activeOption && (
                    <div className="hidden h-96 w-1/2 flex-none flex-col divide-y divide-gray-100 overflow-y-auto sm:flex">
                      <div className="flex-none p-6 text-center">
                        <img
                          src={activeOption.imageUrl}
                          alt=""
                          className="mx-auto size-16 rounded-full"
                        />
                        <h2 className="mt-3 font-semibold text-gray-900">
                          {activeOption.name}
                        </h2>
                        <p className="text-sm/6 text-gray-500">
                          {activeOption.role}
                        </p>
                      </div>
                      <div className="flex flex-auto flex-col justify-between p-6">
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm text-gray-700">
                          <dt className="col-end-1 font-semibold text-gray-900">
                            Phone
                          </dt>
                          <dd>{activeOption.phone}</dd>
                          <dt className="col-end-1 font-semibold text-gray-900">
                            URL
                          </dt>
                          <dd className="truncate">
                            <a
                              href={activeOption.url}
                              className="text-indigo-600 underline"
                            >
                              {activeOption.url}
                            </a>
                          </dd>
                          <dt className="col-end-1 font-semibold text-gray-900">
                            Email
                          </dt>
                          <dd className="truncate">
                            <a
                              href={`mailto:${activeOption.email}`}
                              className="text-indigo-600 underline"
                            >
                              {activeOption.email}
                            </a>
                          </dd>
                        </dl>
                        <button
                          type="button"
                          className="mt-6 w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        >
                          Send message
                        </button>
                      </div>
                    </div>
                  )}
                </ComboboxOptions>
              )}

              {search !== "" && results.length === 0 && (
                <div className="px-6 py-14 text-center text-sm sm:px-14">
                  <UsersIcon
                    className="mx-auto size-6 text-gray-400"
                    aria-hidden="true"
                  />
                  <p className="mt-4 font-semibold text-gray-900">
                    No people found
                  </p>
                  <p className="mt-2 text-gray-500">
                    We couldn’t find anything with that term. Please try again.
                  </p>
                </div>
              )}
            </>
          )}
        </Combobox>
      </div>
    </div>
  );
}
