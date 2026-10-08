import {
  getListingFacets,
  getShopSummaries,
  LISTING_SORTS,
  type ListingFilters as Filters,
  searchListings,
} from "@/lib/shop-items";
import { Suspense } from "react";
import { MapPinIcon } from "@heroicons/react/24/outline";
import { ListingFilters } from "@/app/shopping/filters";
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
import { MUTED, PAGE_PANEL } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";

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
    system: read("system"),
    sort: LISTING_SORTS.find((entry) => entry === sort),
  };
  const filtered = !!(
    filters.query ||
    filters.type ||
    filters.category ||
    filters.system
  );

  const [{ items, total }, facets, shops] = await Promise.all([
    searchListings(filters, {
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    getListingFacets(),
    getShopSummaries(8),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** L'adresse d'une autre page de résultats, filtres conservés. */
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    for (const key of ["q", "type", "category", "system", "sort"]) {
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
            {t("itemsCount", { count: total })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/shopping/my-orders">{t("myOrders")}</Link>
          </Button>
          <Button asChild>
            <Link href="/shopping/sell">{t("ctaSellButton")}</Link>
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="sr-only">{t("latestTitle")}</h2>
        <Suspense fallback={null}>
          <ListingFilters
            categories={facets.categories}
            systems={facets.systems}
          />
        </Suspense>

        {items.length === 0 ? (
          <p className={MUTED}>{filtered ? t("noResults") : t("noItems")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="relative flex flex-col overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/50 transition-colors hover:border-[#9ED0FF]/50"
              >
                <Image
                  alt=""
                  src={item.image || "/item_empty.png"}
                  className="aspect-4/3 w-full object-cover"
                  width={400}
                  height={300}
                />
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <h3 className="font-semibold text-[#CCE7FF]">
                    <Link
                      href={`/shopping/i/${item.id}`}
                      className="after:absolute after:inset-0"
                    >
                      {item.name}
                    </Link>
                  </h3>
                  <p className={cn("text-sm", MUTED)}>
                    {t("shop")} :{" "}
                    <Link
                      href={`/shops/${item.shop.id}`}
                      className="relative z-10 text-[#CCE7FF] hover:underline"
                    >
                      {item.shop.name}
                    </Link>
                  </p>
                  {(item.category || item.type === "SERVICE") && (
                    <p className={cn("text-xs", MUTED)}>
                      {item.type === "SERVICE"
                        ? t("types.SERVICE")
                        : item.category}
                    </p>
                  )}
                  {item.location && (
                    <p className={cn("flex items-center gap-1 text-xs", MUTED)}>
                      <MapPinIcon aria-hidden="true" className="size-3.5" />
                      {item.location.name}
                    </p>
                  )}
                  <p className="mt-auto pt-2 font-mono font-semibold text-[#CFE8FF]">
                    {format.number(Number(item.price))} aUEC
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page - 1)}>{t("prev")}</Link>
              </Button>
            )}
            <span className={cn("text-sm", MUTED)}>
              {t("pageInfo", { page, totalPages })}
            </span>
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page + 1)}>{t("next")}</Link>
              </Button>
            )}
          </div>
        )}
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
                className="flex flex-col gap-0.5 rounded-xl border border-[#9ED0FF]/25 bg-[#092F49]/50 px-4 py-3 transition-colors hover:border-[#9ED0FF]/50"
              >
                <span className="font-semibold text-[#CCE7FF]">
                  {shop.name}
                </span>
                <span className={cn("text-xs", MUTED)}>
                  {t("itemsCount", { count: shop.itemCount })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
