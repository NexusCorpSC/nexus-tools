import { getShopItem, isUserSellerOfShop } from "@/lib/shop-items";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { BuyBox, LoginToBuy } from "./buy-box";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckIcon, CrossCircledIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { MapPinIcon } from "@heroicons/react/24/outline";
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

  const [item, session] = await Promise.all([
    getShopItem((await params).itemId),
    auth.api.getSession({ headers: await headers() }),
  ]);

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

  const available = Math.max(0, item.stock - (item.reserved ?? 0));
  const isSeller =
    !!session?.user?.id &&
    (await isUserSellerOfShop(item.shop.id, new ObjectId(session.user.id)));
  const canBuy = item.type === "OBJECT" && available > 0;

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

          {available <= 0 && (
            <p className="flex items-center gap-2 text-sm">
              <CrossCircledIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-red-300"
              />
              {t("soldOut")}
            </p>
          )}
          {available > 0 && available <= 5 && (
            <p className="flex items-center gap-2 text-sm">
              <ExclamationTriangleIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-amber-300"
              />
              {t("lowStock")}
            </p>
          )}
          {available > 5 && (
            <p className="flex items-center gap-2 text-sm">
              <CheckIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-emerald-300"
              />
              {t("inStock")}
            </p>
          )}

          {(item.location || item.itemSlug) && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              {item.location && (
                <>
                  <dt className={MUTED}>{t("pickup")}</dt>
                  <dd className="flex items-center gap-1">
                    <MapPinIcon aria-hidden="true" className="size-4" />
                    {item.location.name}
                    {item.location.system && (
                      <span className={MUTED}>· {item.location.system}</span>
                    )}
                  </dd>
                </>
              )}
              {item.category && (
                <>
                  <dt className={MUTED}>{t("category")}</dt>
                  <dd>{item.category}</dd>
                </>
              )}
              {item.manufacturer && (
                <>
                  <dt className={MUTED}>{t("manufacturer")}</dt>
                  <dd>{item.manufacturer}</dd>
                </>
              )}
              {item.size !== undefined && (
                <>
                  <dt className={MUTED}>{t("size")}</dt>
                  <dd className="font-mono">S{item.size}</dd>
                </>
              )}
              {item.itemSlug && (
                <dd className="col-span-2">
                  <Link
                    href={`/items/${item.itemSlug}`}
                    className="text-[#CCE7FF] hover:underline"
                  >
                    {t("catalogueLink")}
                  </Link>
                </dd>
              )}
            </dl>
          )}

          {item.description && (
            <p className="prose prose-invert whitespace-pre-wrap text-base">
              {item.description}
            </p>
          )}

          <div className="space-y-3 rounded-xl border border-[#9ED0FF]/25 bg-[#092F49]/50 p-4">
            {canBuy && !isSeller && session?.user && (
              <BuyBox
                listingId={item.id}
                unitPrice={Number(item.price) || 0}
                available={available}
                pickupName={item.location?.name}
              />
            )}
            {canBuy && !session?.user && (
              <LoginToBuy
                href={`/login?callbackUrl=${encodeURIComponent(`/shopping/i/${item.id}`)}`}
              />
            )}
            {isSeller ? (
              <p className={cn("text-sm", MUTED)}>{t("ownListing")}</p>
            ) : (
              <>
                <Button
                  asChild
                  variant={canBuy ? "outline" : "default"}
                  className="w-full"
                >
                  <Link href={`/shops/${item.shop.id}#commander`}>
                    {t("askShop")}
                  </Link>
                </Button>
                <p className={cn("text-xs", MUTED)}>{t("askShopHelp")}</p>
              </>
            )}
          </div>

          <Suspense fallback={null}>
            <StockModificationSection item={item} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
