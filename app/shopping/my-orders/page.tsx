import { getFormatter, getTranslations } from "next-intl/server";
import { RememberListUrl } from "@/components/remember-list-url";
import type { Metadata } from "next";
import { getOrdersForUser, countOrdersForUser } from "@/lib/shop-orders";
import { getShopNames } from "@/lib/shop-items";
import { MUTED, OrderStatusBadge, PAGE_PANEL, ROW_LINK } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
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

export const metadata: Metadata = {
  title: "Mes commandes",
  description: "Consultez et gérez vos commandes passées sur le Marketplace Nexus Tools.",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 15;


export default async function MyOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const t = await getTranslations("MyOrders");
  const tShopping = await getTranslations("Shopping");
  const tOrders = await getTranslations("Orders");
  const format = await getFormatter();
  const userId = new ObjectId(session.user.id);

  const [orders, total] = await Promise.all([
    getOrdersForUser(userId, { offset, limit: PAGE_SIZE }),
    countOrdersForUser(userId),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shopNames = await getShopNames(orders.map((order) => order.shopId));

  return (
    <div className={cn(PAGE_PANEL, "max-w-4xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{tShopping("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/shopping">{t("shopping")}</BreadcrumbLink>
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
        <div className={cn("py-10 text-center", MUTED)}>
          <p>{t("empty")}</p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/shopping">{t("backToShopping")}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/shopping/my-orders/${order.id}`}
              className={ROW_LINK}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#CCE7FF]">
                    {shopNames.get(order.shopId) ?? t("shop")}
                  </p>
                  <p className={cn("mt-1 line-clamp-1 text-sm", MUTED)}>
                    {order.message}
                  </p>
                  <p className={cn("mt-1 text-xs", MUTED)}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                  {order.total !== undefined && (
                    <p className="mt-1 font-mono text-sm font-semibold text-[#CFE8FF]">
                      {format.number(order.total)} aUEC
                    </p>
                  )}
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
              <Link href={`/shopping/my-orders?page=${page - 1}`}>
                {t("prev")}
              </Link>
            </Button>
          )}
          <span className={cn("text-sm", MUTED)}>
            {t("pageInfo", { page, totalPages })}
          </span>
          {page < totalPages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/shopping/my-orders?page=${page + 1}`}>
                {t("next")}
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
