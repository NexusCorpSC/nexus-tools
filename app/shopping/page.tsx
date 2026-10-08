import {
  getListingFacets,
  getShopSummaries,
  LISTING_SORTS,
  type ListingFilters as Filters,
  searchListings,
} from "@/lib/shop-items";
import { Suspense } from "react";
import { MapPinIcon } from "@heroicons/react/24/outline";
import {
  CategoryChips,
  FacetSidebar,
  ListingSearchBar,
} from "@/app/shopping/filters";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import { countOpenOrdersForUser } from "@/lib/shop-orders";
import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { RememberListUrl } from "@/components/remember-list-url";
import { MUTED, PAGE_PANEL, ShopLogo, stockTag, Tag } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import { FILTER_KEYS } from "@/app/shopping/filter-keys";

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Achetez et vendez des objets, vaisseaux et services Star Citizen sur le Marketplace Nexus Tools. Parcourez les dernières annonces et les boutiques disponibles.",
  openGraph: {
    title: "Marketplace — Nexus Tools",
    description:
      "Achetez et vendez des objets et services Star Citizen sur le Marketplace communautaire.",
    url: "https://tools.services.nexus/shopping",
  },
};

const PAGE_SIZE = 12;

function readNumber(value: string | undefined) {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("Shopping");
  const format = await getFormatter();

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  };
  const page = Math.max(1, parseInt(read("page") ?? "1", 10) || 1);
  const type = read("type");
  const sort = read("sort");
  const filters: Filters = {
    query: read("q"),
    type: type === "OBJECT" || type === "SERVICE" ? type : undefined,
    category: read("category"),
    systems: read("system")?.split(",").filter(Boolean),
    minPrice: readNumber(read("min")),
    maxPrice: readNumber(read("max")),
    size: readNumber(read("size")),
    includeSoldOut: read("stock") === "all",
    sort: LISTING_SORTS.find((entry) => entry === sort),
  };
  const filtered = FILTER_KEYS.some((key) => key !== "sort" && read(key));

  const session = await auth.api.getSession({ headers: await headers() });
  const [{ items, total, shopCount }, facets, shops, openOrders] =
    await Promise.all([
      searchListings(filters, {
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
      getListingFacets(),
      getShopSummaries(8),
      session?.user?.id
        ? countOpenOrdersForUser(new ObjectId(session.user.id))
        : 0,
    ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** L'adresse d'une autre page de résultats, filtres conservés. */
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = read(key);
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `/shopping?${query}` : "/shopping";
  };

  return (
    <div className={cn(PAGE_PANEL, "max-w-7xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <RememberListUrl />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className={cn("text-sm", MUTED)}>
            {t("resultsCount", { count: total, shops: shopCount })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/shopping/my-orders">
              {t("myOrders")}
              {openOrders > 0 && (
                <span className="rounded-full bg-[#9ED0FF]/15 px-1.5 font-mono text-xs">
                  {openOrders}
                </span>
              )}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/shopping/sell">{t("ctaSellButton")}</Link>
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="sr-only">{t("latestTitle")}</h2>
        <Suspense fallback={null}>
          <ListingSearchBar />
          <CategoryChips categories={facets.categories} />
        </Suspense>

        <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
          <aside aria-label={t("filtersLabel")}>
            <Suspense fallback={null}>
              <FacetSidebar systems={facets.systems} sizes={facets.sizes} />
            </Suspense>
          </aside>

          <div className="min-w-0 space-y-4">
            {items.length === 0 ? (
              <p className={MUTED}>
                {filtered ? t("noResults") : t("noItems")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => {
                  const tag = stockTag(item.type, item.available ?? 0);
                  const details =
                    item.type === "SERVICE"
                      ? [t("types.SERVICE")]
                      : [
                          item.category,
                          item.size !== undefined && `S${item.size}`,
                          item.manufacturer,
                        ].filter(Boolean);
                  return (
                    <div
                      key={item.id}
                      className="relative flex flex-col overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/70 transition-colors hover:border-[#9ED0FF]/50"
                    >
                      <Image
                        alt=""
                        src={item.image || "/item_empty.png"}
                        className="aspect-16/10 w-full object-cover"
                        width={400}
                        height={250}
                      />
                      <div className="flex flex-1 flex-col gap-1.5 p-3">
                        <h3 className="font-semibold text-[#CCE7FF]">
                          <Link
                            href={`/shopping/i/${item.id}`}
                            className="after:absolute after:inset-0"
                          >
                            {item.name}
                          </Link>
                        </h3>
                        {details.length > 0 && (
                          <p className={cn("text-xs", MUTED)}>
                            {details.join(" · ")}
                          </p>
                        )}
                        {item.location && (
                          <p
                            className={cn(
                              "flex items-center gap-1 text-xs",
                              MUTED,
                            )}
                          >
                            <MapPinIcon
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                            {item.location.name}
                            {item.location.system &&
                              ` · ${item.location.system}`}
                          </p>
                        )}
                        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                          <span className="font-mono font-semibold text-[#CFE8FF]">
                            {format.number(Number(item.price))} aUEC
                          </span>
                          <Tag tone={tag.tone}>
                            {t(`stockTags.${tag.key}`, { count: tag.count })}
                          </Tag>
                        </div>
                        <Link
                          href={`/shops/${item.shop.id}`}
                          className={cn(
                            "relative z-10 w-fit text-xs hover:underline",
                            MUTED,
                          )}
                        >
                          {item.shop.name}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn("text-sm", MUTED)}>
                  {t("pageInfo", { page, totalPages })}
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={pageHref(page - 1)}>{t("prev")}</Link>
                    </Button>
                  )}
                  {page < totalPages && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={pageHref(page + 1)}>{t("next")}</Link>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">{t("shops")}</h2>
        {shops.length === 0 ? (
          <p className={MUTED}>{t("noShops")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {shops.map((shop) => (
              <Link
                key={shop.id}
                href={`/shops/${shop.id}`}
                className="flex items-center gap-3 rounded-xl border border-[#9ED0FF]/25 bg-[#092F49]/50 px-3 py-3 transition-colors hover:border-[#9ED0FF]/50"
              >
                <ShopLogo name={shop.name} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[#CCE7FF]">
                    {shop.name}
                  </span>
                  <span className={cn("block text-xs", MUTED)}>
                    {t("itemsCount", { count: shop.itemCount })}
                    {shop.system && ` · ${shop.system}`}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
