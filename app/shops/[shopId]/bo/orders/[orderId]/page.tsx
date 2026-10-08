import { getTranslations } from "next-intl/server";
import { ListLink } from "@/components/list-link";
import type { Metadata } from "next";
import { getShop, isUserSellerOfShop } from "@/lib/shop-items";
import { getOrderById } from "@/lib/shop-orders";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { redirect, notFound } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PAGE_PANEL } from "@/app/shopping/ui";
import { OrderView } from "@/app/shopping/order-view";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Détail de commande — Back-office",
  description:
    "Consultez et répondez aux commandes de vos clients sur Nexus Tools.",
  robots: { index: false, follow: false },
};

export default async function BoOrderDetailPage({
  params,
}: {
  params: Promise<{ shopId: string; orderId: string }>;
}) {
  const { shopId, orderId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/shops/${shopId}/bo/orders/${orderId}`)}`,
    );
  }

  const isSeller = await isUserSellerOfShop(
    shopId,
    new ObjectId(session.user.id),
  );
  if (!isSeller) {
    redirect(`/shops/${shopId}`);
  }

  const t = await getTranslations("BoOrders");
  const tShopping = await getTranslations("Shopping");

  const [shop, order] = await Promise.all([
    getShop(shopId),
    getOrderById(orderId),
  ]);

  if (!shop || !order || order.shopId !== shopId) {
    notFound();
  }

  return (
    <div className={cn(PAGE_PANEL, "max-w-5xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{tShopping("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/shops/${shopId}`}>
              {shop.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/shops/${shopId}/bo`}>
              Back-office
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <ListLink href={`/shops/${shopId}/bo/orders`}>
                {t("title")}
              </ListLink>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("orderDetail")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <OrderView
        order={order}
        role="seller"
        shop={{ id: shop.id, name: shop.name }}
      />
    </div>
  );
}
