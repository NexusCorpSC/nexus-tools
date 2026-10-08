import { getTranslations } from "next-intl/server";
import { RememberListUrl } from "@/components/remember-list-url";
import type { Metadata } from "next";
import { getShop } from "@/lib/shop-items";
import { isUserSellerOfShop } from "@/lib/shop-items";
import { getOrdersForShop, countOrdersForShop } from "@/lib/shop-orders";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { MUTED, OrderStatusBadge, PAGE_PANEL, ROW_LINK } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Commandes — Back-office",
  description: "Gérez les commandes reçues sur votre boutique Nexus Tools.",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 15;


export default async function BoOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { shopId } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);

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
  const tOrders = await getTranslations("Orders");
  const shop = await getShop(shopId);

  if (!shop) {
    return (
      <div className={cn(PAGE_PANEL, "max-w-4xl")}>
        <p>{t("shopNotFound")}</p>
      </div>
    );
  }

  const offset = (page - 1) * PAGE_SIZE;
  const [orders, total] = await Promise.all([
    getOrdersForShop(shopId, { offset, limit: PAGE_SIZE }),
    countOrdersForShop(shopId),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={cn(PAGE_PANEL, "max-w-4xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{tShopping("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/shops/${shopId}`}>{shop.name}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/shops/${shopId}/bo`}>Back-office</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <RememberListUrl />

      {orders.length === 0 ? (
        <p className={MUTED}>{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/shops/${shopId}/bo/orders/${order.id}`}
              className={ROW_LINK}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#CCE7FF]">{order.userName}</p>
                  <p className={cn("mt-1 line-clamp-1 text-sm", MUTED)}>
                    {order.message}
                  </p>
                  <p className={cn("mt-1 text-xs", MUTED)}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <OrderStatusBadge
                  status={order.status}
                  label={tOrders(`status.${order.status}`)}
                />
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/shops/${shopId}/bo/orders?page=${page - 1}`}>
                {t("prev")}
              </Link>
            </Button>
          )}
          <span className={cn("text-sm", MUTED)}>
            {t("pageInfo", { page, totalPages })}
          </span>
          {page < totalPages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/shops/${shopId}/bo/orders?page=${page + 1}`}>
                {t("next")}
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

