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
import { RespondForm } from "@/app/shops/[shopId]/bo/orders/components";
import { MUTED, OrderStatusBadge, PAGE_PANEL, TEXT_BOX } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Détail de commande — Back-office",
  description: "Consultez et répondez aux commandes de vos clients sur Nexus Tools.",
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
    redirect("/login");
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

  const canRespond = order.status === "PENDING" || order.status === "QUOTED";

  return (
    <div className={cn(PAGE_PANEL, "max-w-2xl")}>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("orderDetail")}</h1>
        <OrderStatusBadge
          status={order.status}
          label={t(`status.${order.status}`)}
        />
      </div>

      <div className={cn("space-y-1 text-sm", MUTED)}>
        <p>
          {t("from")} : <span className="font-medium text-[#CCE7FF]">{order.userName}</span>
        </p>
        <p>
          {t("date")} : {new Date(order.createdAt).toLocaleString()}
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("customerMessage")}</h2>
        <div className={TEXT_BOX}>
          {order.message}
        </div>
      </div>

      {order.response && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("currentResponse")}</h2>
          <div className={cn(TEXT_BOX, "border-sky-300/30")}>
            {order.response}
          </div>
          {order.quote !== undefined && (
            <p className="font-mono text-sm font-semibold text-[#CFE8FF]">
              {t("currentQuote")} : {order.quote} aUEC
            </p>
          )}
        </div>
      )}

      {order.userComment && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("userComment")}</h2>
          <div className={cn(TEXT_BOX, "italic")}>
            {order.userComment}
          </div>
        </div>
      )}

      {canRespond && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("respondTitle")}</h2>
          <RespondForm
            orderId={orderId}
            shopId={shopId}
            initialResponse={order.response}
            initialQuote={order.quote}
          />
        </div>
      )}
    </div>
  );
}
