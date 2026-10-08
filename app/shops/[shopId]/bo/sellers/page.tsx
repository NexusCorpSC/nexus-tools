import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getShopOwnerId, getShopSellers } from "@/lib/shop-items";
import { MUTED, Tag } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import {
  AddSellerSearch,
  RemoveSellerButton,
} from "@/app/shops/[shopId]/manage/components";

export const metadata: Metadata = {
  title: "Vendeurs — Back-office",
  robots: { index: false, follow: false },
};

/** Ceux qui vendent pour le magasin, et l'ajout d'un vendeur par son pseudo. */
export default async function BoSellersPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const t = await getTranslations("ShopBo.sellers");
  const session = await auth.api.getSession({ headers: await headers() });
  const [sellers, ownerId] = await Promise.all([
    getShopSellers(shopId),
    getShopOwnerId(shopId),
  ]);

  return (
    <>
      <h2 className="text-xl font-bold">{t("title")}</h2>
      <p className={cn("text-sm", MUTED)}>{t("intro")}</p>

      <ul className="space-y-2">
        {sellers.map((seller) => (
          <li
            key={seller.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/50 px-3 py-2"
          >
            <span className="flex items-center gap-2">
              {seller.name}
              {seller.id === ownerId && <Tag tone="info">{t("owner")}</Tag>}
              {seller.id === session?.user?.id && (
                <Tag tone="dim">{t("you")}</Tag>
              )}
            </span>
            {seller.id !== session?.user?.id && seller.id !== ownerId && (
              <RemoveSellerButton shopId={shopId} sellerId={seller.id} />
            )}
          </li>
        ))}
      </ul>

      <div className="max-w-md">
        <AddSellerSearch shopId={shopId} />
      </div>
    </>
  );
}
