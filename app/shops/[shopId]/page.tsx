import {
  getShop,
  getShopItemsOfShop,
  isUserSellerOfShop,
} from "@/lib/shop-items";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ShopButtons } from "@/app/shops/[shopId]/components";
import { MarkdownContent } from "@/components/markdown-content";
import { PlaceOrderForm } from "@/app/shops/[shopId]/order-components";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "bson";

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
      url: `https://tools.nexus.services/shops/${shopId}`,
    },
  };
}

export default async function ShopPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const t = await getTranslations("ShopDetails");
  const shopId = (await params).shopId;
  const shop = await getShop(shopId);
  const session = await auth.api.getSession({ headers: await headers() });
  const isSeller =
    session?.user?.id &&
    (await isUserSellerOfShop(shopId, new ObjectId(session.user.id)));

  if (!shop) {
    return (
      <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="text-2xl font-bold mb-4">{t("notFound")}</h1>
      </div>
    );
  }

  const shopItems = await getShopItemsOfShop(shopId, { offset: 0, limit: 10 });

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold mb-4">{shop.name}</h1>
        <Suspense fallback={null}>
          <ShopButtons shopId={shop.id} />
        </Suspense>
      </div>

      <MarkdownContent content={shop.description} />

      <h2 className="text-xl font-bold mb-4">{t("products")}</h2>

      <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-x-8">
        {shopItems.map((item) => (
          <Link key={item.id} href={`/shopping/i/${item.id}`} className="group">
            <Image
              alt={item.name}
              src={item.image}
              className="aspect-square w-full rounded-lg bg-gray-200 object-cover group-hover:opacity-75 xl:aspect-7/8"
              width={300}
              height={300}
              loading="lazy"
            />
            <h3 className="mt-4 text-sm text-nexus-primary">{item.name}</h3>
            <p className="mt-1 text-lg font-medium text-nexus-primary/50">
              {item.price} aUEC
            </p>
          </Link>
        ))}
      </div>

      <h2 className="text-xl font-bold mb-4">{t("placeOrderCTA")}</h2>

      {session?.user ? (
        <PlaceOrderForm shopId={shop.id} />
      ) : (
        <p className="text-sm text-gray-500">{t("loginToOrder")}</p>
      )}
    </div>
  );
}
