import { countShopItems, getShop, getShopItemsOfShop } from "@/lib/shop-items";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ShopButtons } from "@/app/shops/[shopId]/components";
import { MarkdownContent } from "@/components/markdown-content";
import { PlaceOrderForm } from "@/app/shops/[shopId]/order-components";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ListLink } from "@/components/list-link";
import { RememberListUrl } from "@/components/remember-list-url";
import { MUTED, PAGE_PANEL } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shopId: string }>;
}): Promise<Metadata> {
  const shopId = (await params).shopId;
  const shop = await getShop(shopId);

  if (!shop) {
    return { title: "Boutique introuvable" };
  }

  const description = shop.description
    ? shop.description.replace(/[#*_[\]]/g, "").slice(0, 160)
    : `Découvrez la boutique ${shop.name} sur le Marketplace Nexus Tools.`;

  return {
    title: shop.name,
    description,
    openGraph: {
      title: `${shop.name} — Marketplace Nexus Tools`,
      description,
      url: `https://tools.services.nexus/shops/${shopId}`,
    },
  };
}

const PAGE_SIZE = 24;

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const t = await getTranslations("ShopDetails");
  const tShopping = await getTranslations("Shopping");
  const format = await getFormatter();
  const shopId = (await params).shopId;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const [shop, session] = await Promise.all([
    getShop(shopId),
    auth.api.getSession({ headers: await headers() }),
  ]);

  if (!shop) {
    return (
      <div className={cn(PAGE_PANEL, "max-w-7xl")}>
        <h1 className="text-2xl font-bold">{t("notFound")}</h1>
      </div>
    );
  }

  const [shopItems, total] = await Promise.all([
    getShopItemsOfShop(shopId, {
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    countShopItems(shopId),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={cn(PAGE_PANEL, "max-w-7xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{tShopping("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <ListLink href="/shopping">{tShopping("title")}</ListLink>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{shop.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <RememberListUrl />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{shop.name}</h1>
        <Suspense fallback={null}>
          <ShopButtons shopId={shop.id} />
        </Suspense>
      </div>

      <MarkdownContent content={shop.description} />

      <section className="space-y-4">
        <h2 className="text-xl font-bold">{t("products")}</h2>

        {shopItems.length === 0 ? (
          <p className={MUTED}>{t("noItems")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shopItems.map((item) => (
              <Link
                key={item.id}
                href={`/shopping/i/${item.id}`}
                className="flex flex-col overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/50 transition-colors hover:border-[#9ED0FF]/50"
              >
                <Image
                  alt=""
                  src={item.image || "/item_empty.png"}
                  className={cn(
                    "aspect-4/3 w-full object-cover",
                    item.stock <= 0 && "opacity-50",
                  )}
                  width={400}
                  height={300}
                  loading="lazy"
                />
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <h3 className="font-semibold text-[#CCE7FF]">{item.name}</h3>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="font-mono font-semibold text-[#CFE8FF]">
                      {format.number(Number(item.price))} aUEC
                    </span>
                    {item.stock <= 0 && (
                      <span className="inline-flex h-5 items-center rounded border border-red-300/40 px-1.5 text-[11px] font-semibold text-red-200">
                        {t("soldOut")}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/shops/${shopId}?page=${page - 1}`}>
                  {t("prev")}
                </Link>
              </Button>
            )}
            <span className={cn("text-sm", MUTED)}>
              {t("pageInfo", { page, totalPages })}
            </span>
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/shops/${shopId}?page=${page + 1}`}>
                  {t("next")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </section>

      <section id="commander" className="scroll-mt-24 space-y-4">
        <h2 className="text-xl font-bold">{t("placeOrderCTA")}</h2>
        {session?.user ? (
          <PlaceOrderForm shopId={shop.id} />
        ) : (
          <p className={cn("text-sm", MUTED)}>{t("loginToOrder")}</p>
        )}
      </section>
    </div>
  );
}
