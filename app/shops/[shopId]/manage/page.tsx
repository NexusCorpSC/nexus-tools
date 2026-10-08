import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getShop, getShopSellers, isUserSellerOfShop } from "@/lib/shop-items";
import { ObjectId } from "bson";
import { redirect } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { AddSellerButton, RemoveSellerButton, ShopInfoEditor } from "./components";
import { PAGE_PANEL } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Gestion de la boutique",
  description: "Gérez les informations et les vendeurs de votre boutique sur Nexus Tools.",
  robots: { index: false, follow: false },
};

export default async function ShopManagementPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const { shopId } = await params;
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/shops/${shopId}/manage`)}`);
  }
  if (!(await isUserSellerOfShop(shopId, new ObjectId(session.user.id)))) {
    redirect(`/shops/${shopId}`);
  }
  const t = await getTranslations("ShopManagement");
  const tShopping = await getTranslations("Shopping");
  const shop = await getShop(shopId);

  if (!shop) {
    return (
      <div className={cn(PAGE_PANEL, "max-w-2xl")}>
        <h1 className="text-2xl font-bold mb-4">{t("notFound")}</h1>
      </div>
    );
  }

  const sellers = await getShopSellers(shop.id);

  return (
    <div className={cn(PAGE_PANEL, "max-w-2xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{tShopping("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/shopping">{t("shops")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/shops/${shop.id}`}>
              {shop.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold mb-4">{shop.name}</h1>

      <div>
        <h2 className="text-xl font-bold mb-3">{t("shopInfo")}</h2>
        <ShopInfoEditor
          shopId={shop.id}
          initialName={shop.name}
          initialDescription={shop.description}
        />
      </div>

      <div>
        <div className="flex flex-row justify-between">
          <h2 className="text-xl font-bold mb-3">{t("sellers")}</h2>
          <div>
            <AddSellerButton shopId={shop.id} />
          </div>
        </div>

        <div>
          {sellers.map((seller) => (
            <div
              key={seller.id}
              className="mb-2 flex flex-row items-center justify-between rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/50 px-3 py-2"
            >
              <p className="text-lg">{seller.name}</p>
              <div>
                {seller.id !== session?.user?.id && (
                  <RemoveSellerButton shopId={shop.id} sellerId={seller.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
