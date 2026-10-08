import { getTranslations } from "next-intl/server";
import { ListLink } from "@/components/list-link";
import type { Metadata } from "next";
import { getOrderById } from "@/lib/shop-orders";
import { getShop } from "@/lib/shop-items";
import Link from "next/link";
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
import { OrderActions } from "../components";
import { MUTED, OrderStatusBadge, PAGE_PANEL, TEXT_BOX } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Détail de commande",
  description: "Consultez le détail de votre commande sur le Marketplace Nexus Tools.",
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
    redirect("/login");
  }

  const t = await getTranslations("MyOrders");
  const tShopping = await getTranslations("Shopping");
  const order = await getOrderById(orderId);

  if (!order || order.userId !== session.user.id) {
    notFound();
  }

  const shop = await getShop(order.shopId);

  return (
    <div className={cn(PAGE_PANEL, "max-w-2xl")}>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("orderDetail")}</h1>
        <OrderStatusBadge
          status={order.status}
          label={t(`status.${order.status}`)}
        />
      </div>

      <div className={cn("space-y-1 text-sm", MUTED)}>
        {shop && (
          <p>
            {t("shop")} :{" "}
            <Link
              href={`/shops/${shop.id}`}
              className="font-medium text-[#CCE7FF] hover:underline"
            >
              {shop.name}
            </Link>
          </p>
        )}
        <p>
          {t("date")} : {new Date(order.createdAt).toLocaleString()}
        </p>
        {order.updatedAt !== order.createdAt && (
          <p>
            {t("updated")} : {new Date(order.updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("yourMessage")}</h2>
        <div className={TEXT_BOX}>
          {order.message}
        </div>
      </div>

      {order.response && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("shopResponse")}</h2>
          <div className={cn(TEXT_BOX, "border-sky-300/30")}>
            {order.response}
          </div>
          {order.quote !== undefined && (
            <div className="rounded-xl border border-emerald-300/30 bg-[#092F49]/50 p-4">
              <p className="font-mono text-sm font-semibold text-emerald-200">
                {t("quoteAmount")} : {order.quote} aUEC
              </p>
            </div>
          )}
        </div>
      )}

      <OrderActions
        orderId={order.id}
        status={order.status}
        hasQuote={order.quote !== undefined}
      />
    </div>
  );
}
