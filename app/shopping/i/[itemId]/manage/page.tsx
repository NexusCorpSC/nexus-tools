import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getShopItem, isUserSellerOfShop } from "@/lib/shop-items";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { StockModificationForm } from "@/app/shopping/i/[itemId]/components";
import { MUTED, PAGE_PANEL } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Gérer l'annonce",
  robots: { index: false, follow: false },
};

/**
 * La gestion d'une annonce par les vendeurs de son magasin : le stock se
 * corrige ici, plus sur la fiche publique.
 */
export default async function ManageListingPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/shopping/i/${itemId}/manage`)}`,
    );
  }

  const item = await getShopItem(itemId);
  if (
    !item ||
    !(await isUserSellerOfShop(item.shop.id, new ObjectId(session.user.id)))
  ) {
    redirect(`/shopping/i/${itemId}`);
  }

  const t = await getTranslations("ShopItemManagement");
  const tShopping = await getTranslations("Shopping");
  const reserved = item.reserved ?? 0;

  return (
    <div className={cn(PAGE_PANEL, "max-w-2xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/shopping">
              {tShopping("title")}
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
            <BreadcrumbLink href={`/shopping/i/${item.id}`}>
              {item.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <dl className="grid grid-cols-3 gap-3">
        {[
          [t("stock"), item.stock],
          [t("reservedLabel"), reserved],
          [t("available"), Math.max(0, item.stock - reserved)],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-[#9ED0FF]/15 px-3 py-2"
          >
            <dt className={cn("text-xs", MUTED)}>{label}</dt>
            <dd className="font-mono text-xl font-bold text-[#CCE7FF]">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 p-4">
        <h2 className="font-semibold">{t("changeStock")}</h2>
        <p className={cn("text-sm", MUTED)}>{t("changeStockHelp")}</p>
        <StockModificationForm itemId={item.id} />
      </div>

      <Link
        href={`/shopping/i/${item.id}`}
        className="text-sm text-[#CCE7FF] hover:underline"
      >
        {t("backToListing")}
      </Link>
    </div>
  );
}
