import {
  getShopItem,
  isListingOnSale,
  isUserSellerOfShop,
} from "@/lib/shop-items";
import { syncLinkedListings } from "@/lib/shop-stock";
import { ReportMenu } from "@/components/report-menu";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { BuyBox, LoginToBuy } from "./buy-box";
import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { ChatBubbleLeftIcon, MapPinIcon } from "@heroicons/react/24/outline";
import { Fragment, type ReactNode } from "react";
import { countDeliveredOrdersForShop } from "@/lib/shop-orders";
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
import { MUTED, PAGE_PANEL, ShopLogo, stockTag, Tag } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}): Promise<Metadata> {
  const item = await getShopItem((await params).itemId);

  if (!item || !isListingOnSale(item, item.shop)) {
    return { title: "Article introuvable", robots: { index: false } };
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

  const { itemId } = await params;
  await syncLinkedListings({ id: itemId });
  const [item, session] = await Promise.all([
    getShopItem(itemId),
    auth.api.getSession({ headers: await headers() }),
  ]);
  const isSeller =
    !!item &&
    !!session?.user?.id &&
    (await isUserSellerOfShop(item.shop.id, new ObjectId(session.user.id)));
  const onSale = !!item && isListingOnSale(item, item.shop);

  // Une annonce retirée ou masquée n'existe plus que pour ses vendeurs.
  if (!item || (!onSale && !isSeller)) {
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
  const canBuy = onSale && item.type === "OBJECT" && available > 0;
  const tag = stockTag(item.type, available);
  const delivered = await countDeliveredOrdersForShop(item.shop.id);
  const specs: [string, ReactNode][] = [];
  if (item.category) specs.push([t("category"), item.category]);
  if (item.size !== undefined) {
    specs.push([
      t("size"),
      <span key="size" className="font-mono">
        S{item.size}
      </span>,
    ]);
  }
  if (item.manufacturer) specs.push([t("manufacturer"), item.manufacturer]);
  if (item.location) {
    specs.push([
      t("pickup"),
      <span key="pickup" className="flex items-center gap-1">
        <MapPinIcon aria-hidden="true" className="size-4" />
        {item.location.name}
        {item.location.system && (
          <span className={MUTED}>· {item.location.system}</span>
        )}
      </span>,
    ]);
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

      {!onSale && (
        <p className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {item.reportHidden || item.shop.reportHidden
            ? t("hiddenByModeration")
            : t("hiddenBySeller")}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-4">
          <Image
            alt={item.name}
            src={item.image || "/item_empty.png"}
            className="aspect-4/3 w-full rounded-xl object-cover"
            width={700}
            height={525}
          />
          {specs.length > 0 && (
            <div className="space-y-3 rounded-xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{t("specs")}</h2>
                {item.itemSlug && (
                  <Link
                    href={`/items/${item.itemSlug}`}
                    className="text-sm text-sky-200 hover:underline"
                  >
                    {t("catalogueLink")}
                  </Link>
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                {specs.map(([label, value]) => (
                  <Fragment key={label}>
                    <dt className={MUTED}>{label}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          )}
        </div>

        <section aria-labelledby="information-heading" className="space-y-5">
          <h2 id="information-heading" className="sr-only">
            {t("productInfo")}
          </h2>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Tag tone={tag.tone}>
                {t(`stockTags.${tag.key}`, { count: tag.count })}
              </Tag>
              <Tag tone="dim">{t(`types.${item.type}`)}</Tag>
            </div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-[#CCE7FF] sm:text-4xl">
                {item.name}
              </h1>
              {!isSeller && (
                <ReportMenu type="listing" id={item.id} name={item.name} />
              )}
            </div>
            <p
              className={cn("flex flex-wrap items-center gap-2 text-sm", MUTED)}
            >
              <ShopLogo
                name={item.shop.name}
                logo={item.shop.logo}
                className="size-6 rounded text-[10px]"
              />
              {t("soldBy")}{" "}
              <Link
                href={`/shops/${item.shop.id}`}
                className="text-[#CCE7FF] hover:underline"
              >
                {item.shop.name}
              </Link>
              {delivered > 0 && (
                <span>· {t("deliveredCount", { count: delivered })}</span>
              )}
            </p>
          </div>

          {item.description && (
            <p className="prose prose-invert text-base whitespace-pre-wrap">
              {item.description}
            </p>
          )}

          <div className="space-y-4 rounded-xl border border-[#9ED0FF]/30 bg-[#062338]/45 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-bold text-[#CFE8FF]">
                {format.number(Number(item.price))} aUEC
              </span>
              <span className={cn("text-sm", MUTED)}>{t("perUnit")}</span>
            </div>
            {canBuy && !isSeller && session?.user && (
              <BuyBox
                listingId={item.id}
                name={item.name}
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
              <div className="space-y-3">
                <p className={cn("text-sm", MUTED)}>
                  {t("ownListing")}{" "}
                  {t("stockSummary", {
                    stock: item.stock,
                    reserved: item.reserved ?? 0,
                  })}
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/shops/${item.shop.id}/bo/listings/${item.id}`}>
                    {t("manageListing")}
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <Button
                  asChild
                  variant={canBuy ? "outline" : "default"}
                  className="w-full"
                >
                  <Link href={`/shops/${item.shop.id}#commander`}>
                    <ChatBubbleLeftIcon aria-hidden="true" className="size-4" />
                    {t("askShop")}
                  </Link>
                </Button>
                <p className={cn("text-xs", MUTED)}>{t("askShopHelp")}</p>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
