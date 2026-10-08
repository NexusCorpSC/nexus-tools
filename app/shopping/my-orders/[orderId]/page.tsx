import { getTranslations } from "next-intl/server";
import { ListLink } from "@/components/list-link";
import type { Metadata } from "next";
import { getOrderById } from "@/lib/shop-orders";
import { getShop } from "@/lib/shop-items";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
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
  title: "Détail de commande",
  description:
    "Consultez le détail de votre commande sur le Marketplace Nexus Tools.",
  robots: { index: false, follow: false },
};

export default async function MyOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/shopping/my-orders/${orderId}`)}`,
    );
  }

  const t = await getTranslations("MyOrders");
  const tShopping = await getTranslations("Shopping");
  const order = await getOrderById(orderId);

  if (!order || order.userId !== session.user.id) {
    notFound();
  }

  const shop = await getShop(order.shopId);

  return (
    <div className={cn(PAGE_PANEL, "max-w-5xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{tShopping("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <ListLink href="/shopping/my-orders">{t("title")}</ListLink>
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
        role="buyer"
        shop={shop ? { id: shop.id, name: shop.name } : null}
      />
    </div>
  );
}
