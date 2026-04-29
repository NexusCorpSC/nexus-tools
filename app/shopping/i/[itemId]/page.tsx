import { getShopItem } from "@/lib/shop-items";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckIcon, CrossCircledIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { Suspense } from "react";
import { StockModificationSection } from "@/app/shopping/i/[itemId]/server-components";
import { getTranslations } from "next-intl/server";
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
      url: `https://tools.nexus.services/shopping/i/${item.id ?? ""}`,
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

  const item = await getShopItem((await params).itemId);

  if (!item) {
    return (
      <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="text-2xl font-bold mb-4">{t("notFound")}</h1>

        <Link href="/shopping">{t("backToShopping")}</Link>
      </div>
    );
  }

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:grid lg:max-w-7xl lg:grid-cols-2 lg:gap-x-8 lg:px-8">
        <div className="lg:max-w-lg lg:self-end">
          <nav aria-label="Breadcrumb">
            <ol role="list" className="flex items-center space-x-2"></ol>
          </nav>

          <div className="mt-4">
            <h1 className="text-3xl font-bold tracking-tight text-nexus-primary sm:text-4xl">
              {item.name}
            </h1>
          </div>

          <section aria-labelledby="information-heading" className="mt-4">
            <h2 id="information-heading" className="sr-only">
              {t("productInfo")}
            </h2>

            <div className="flex items-center">
              <p className="text-lg text-nexus-primary sm:text-xl">
                {item.price} aUEC
              </p>
            </div>

            <div className="flex items-center">
              <p className="text-md text-nexus-primary sm:text-lg">
                {t("soldBy")}{" "}
                <Link
                  href={`/shops/${item.shop.id}`}
                  className="text-nexus-primary hover:text-nexus-primary/70"
                >
                  {item.shop.name}
                </Link>
              </p>
            </div>

            <div className="mt-4 space-y-6">
              <p className="text-base prose prose-invert">{item.description}</p>
            </div>

            {item.stock <= 0 && (
              <div className="mt-6 flex items-center">
                <CrossCircledIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-red-500"
                />
                <p className="ml-2 text-sm text-nexus-primary">
                  {t("soldOut")}
                </p>
              </div>
            )}
            {item.stock > 0 && item.stock <= 5 && (
              <div className="mt-6 flex items-center">
                <ExclamationTriangleIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-orange-500"
                />
                <p className="ml-2 text-sm text-nexus-primary">
                  {t("lowStock")}
                </p>
              </div>
            )}
            {item.stock > 5 && (
              <div className="mt-6 flex items-center">
                <CheckIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-green-500"
                />
                <p className="ml-2 text-sm text-nexus-primary">
                  {t("inStock")}
                </p>
              </div>
            )}
            <div className="pt-4">
              <Suspense fallback={<></>}>
                <StockModificationSection item={item} />
              </Suspense>
            </div>
          </section>
        </div>

        <div className="mt-10 lg:col-start-2 lg:row-span-2 lg:mt-0 lg:self-center">
          <Image
            alt={item.name}
            src={item.image}
            className="aspect-square w-full rounded-lg object-cover"
            width={500}
            height={500}
          />
        </div>

        <div className="mt-10 lg:col-start-1 lg:row-start-2 lg:max-w-lg lg:self-start">
          <section
            aria-labelledby="options-heading"
            className="flex flex-col gap-2"
          >
            <Button className="w-full">{t("buy")}</Button>
            <Button variant="secondary" className="w-full">
              Passez commande
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
