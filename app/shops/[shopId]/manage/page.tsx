import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getShop, getShopSellers } from "@/lib/shop-items";
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
  const t = await getTranslations("ShopManagement");
  const shop = await getShop((await params).shopId);

  if (!shop) {
    return (
      <div className="m-2 p-6 max-w-2xl mx-auto bg-white rounded-xl shadow-md space-y-6">
        <h1 className="text-2xl font-bold mb-4">{t("notFound")}</h1>
      </div>
    );
  }

  const sellers = await getShopSellers(shop.id);

  return (
    <div className="m-2 p-6 max-w-2xl mx-auto bg-white rounded-xl shadow-md space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/shops">{t("shops")}</BreadcrumbLink>
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
              className="p-2 border rounded mb-2 flex flex-row justify-between"
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
