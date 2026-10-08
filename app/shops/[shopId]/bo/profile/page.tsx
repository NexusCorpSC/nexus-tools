import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getShop } from "@/lib/shop-items";
import { ShopInfoEditor } from "@/app/shops/[shopId]/manage/components";

export const metadata: Metadata = {
  title: "Profil du magasin — Back-office",
  robots: { index: false, follow: false },
};

/** Le nom, la description et le logo du magasin. */
export default async function BoProfilePage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const t = await getTranslations("ShopBo.profile");
  const shop = await getShop(shopId);
  if (!shop) notFound();

  return (
    <>
      <h2 className="text-xl font-bold">{t("title")}</h2>
      <div className="max-w-2xl">
        <ShopInfoEditor
          shopId={shop.id}
          initialName={shop.name}
          initialDescription={shop.description}
          logo={shop.logo}
        />
      </div>
    </>
  );
}
