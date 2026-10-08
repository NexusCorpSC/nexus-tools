import { getShopItem } from "@/lib/shop-items";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckIcon, CrossCircledIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { Suspense } from "react";
import { StockModificationSection } from "@/app/shopping/i/[itemId]/server-components";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ListLink } from "@/components/list-link";
import { MUTED, PAGE_PANEL } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}): Promise<Metadata> {
  const item = await getShopItem((await params).itemId);

  if (!item) {
    return { title: "Article introuvable" };
  }

  const description = item.description
    ? item.description.slice(0, 160)
    : `${item.name} — ${item.price} aUEC. Vendu par ${item.shop.name} sur Nexus Tools.`;

  return {
    title: item.name,
    description,
    openGraph: {
      title: `${item.name} — Marketplace Nexus Tools`,
      description,
      url: `https://tools.services.nexus/shopping/i/${item.id ?? ""}`,
      images: item.image ? [{ url: item.image, alt: item.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${item.name} — Marketplace Nexus Tools`,
      description,
      images: item.image ? [item.image] : undefined,
    },
  };
}

export default async function ShopItemDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const t = await getTranslations("ShoppingItem");
  const tShopping = await getTranslations("Shopping");
  const format = await getFormatter();

  const item = await getShopItem((await params).itemId);

  if (!item) {
    return (
      <div className={cn(PAGE_PANEL, "max-w-7xl")}>
        <h1 className="text-2xl font-bold">{t("notFound")}</h1>
        <ListLink href="/shopping" className="text-[#CCE7FF] hover:underline">
          {t("backToShopping")}
        </ListLink>
      </div>
    );
  }

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
            <BreadcrumbLink href={`/shops/${item.shop.id}`}>
              {item.shop.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{item.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-8 lg:grid-cols-2">
        <Image
          alt={item.name}
          src={item.image || "/item_empty.png"}
          className="aspect-square w-full rounded-xl object-cover"
          width={600}
          height={600}
        />

        <section aria-labelledby="information-heading" className="space-y-5">
          <h2 id="information-heading" className="sr-only">
            {t("productInfo")}
          </h2>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-[#CCE7FF] sm:text-4xl">
              {item.name}
            </h1>
            <p className={cn("text-sm", MUTED)}>
              {t("soldBy")}{" "}
              <Link
                href={`/shops/${item.shop.id}`}
                className="text-[#CCE7FF] hover:underline"
              >
                {item.shop.name}
              </Link>
            </p>
          </div>

          <p className="font-mono text-2xl font-bold text-[#CFE8FF]">
            {format.number(Number(item.price))} aUEC
          </p>

          {item.stock <= 0 && (
            <p className="flex items-center gap-2 text-sm">
              <CrossCircledIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-red-300"
              />
              {t("soldOut")}
            </p>
          )}
          {item.stock > 0 && item.stock <= 5 && (
            <p className="flex items-center gap-2 text-sm">
              <ExclamationTriangleIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-amber-300"
              />
              {t("lowStock")}
            </p>
          )}
          {item.stock > 5 && (
            <p className="flex items-center gap-2 text-sm">
              <CheckIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-emerald-300"
              />
              {t("inStock")}
            </p>
          )}

          {item.description && (
            <p className="prose prose-invert whitespace-pre-wrap text-base">
              {item.description}
            </p>
          )}

          <div className="space-y-2 rounded-xl border border-[#9ED0FF]/25 bg-[#092F49]/50 p-4">
            <Button asChild className="w-full">
              <Link href={`/shops/${item.shop.id}#commander`}>
                {t("askShop")}
              </Link>
            </Button>
            <p className={cn("text-xs", MUTED)}>{t("askShopHelp")}</p>
          </div>

          <Suspense fallback={null}>
            <StockModificationSection item={item} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
