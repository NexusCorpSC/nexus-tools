import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { countAllShopListings, getShop, isUserSellerOfShop } from "@/lib/shop-items";
import { getShopOrderCounts } from "@/lib/shop-orders";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PAGE_PANEL, ShopLogo } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import { BoNav } from "./bo-nav";

/**
 * Le back-office d'un magasin, réservé à ses vendeurs : une navigation
 * latérale vers les commandes, les annonces, les demandes sur mesure, les
 * vendeurs et le profil du magasin.
 */
export default async function BoLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/shops/${shopId}/bo`)}`);
  }
  if (!(await isUserSellerOfShop(shopId, new ObjectId(session.user.id)))) {
    redirect(`/shops/${shopId}`);
  }

  const t = await getTranslations("ShopBo");
  const tShopping = await getTranslations("Shopping");
  const [shop, counts, listings] = await Promise.all([
    getShop(shopId),
    getShopOrderCounts(shopId),
    countAllShopListings(shopId),
  ]);
  if (!shop) redirect("/shopping");

  return (
    <div className={cn(PAGE_PANEL, "max-w-7xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/shopping">{tShopping("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/shops/${shop.id}`}>{shop.name}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShopLogo name={shop.name} logo={shop.logo} className="size-10" />
          <div>
            <h1 className="text-2xl font-bold">{shop.name}</h1>
            <p className="text-sm text-[#9ED0FF]/70">{t("title")}</p>
          </div>
        </div>
        <Link
          href={`/shops/${shop.id}`}
          className="text-sm text-[#CCE7FF] hover:underline"
        >
          {t("viewShop")}
        </Link>
      </div>

      {shop.reportHidden && (
        <p className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {t("shopHidden")}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[190px_1fr]">
        <Suspense fallback={<div />}>
          <BoNav
            shopId={shop.id}
            counts={{
              orders: counts.toHandle,
              listings,
              custom: counts.custom,
            }}
          />
        </Suspense>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </div>
  );
}
