import { getTranslations } from "next-intl/server";
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

export const metadata: Metadata = {
  title: "Commandes — Back-office",
  description: "Gérez les commandes reçues sur votre boutique Nexus Tools.",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 15;

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  QUOTED: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REFUSED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

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
  const shop = await getShop(shopId);

  if (!shop) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md">
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
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
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

      {orders.length === 0 ? (
        <p className="text-gray-500">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/shops/${shopId}/bo/orders/${order.id}`}
              className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{order.userName}</p>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                    {order.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_COLORS[order.status] ?? "bg-gray-100"}`}
                >
                  {t(`status.${order.status}`)}
                </span>
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
          <span className="text-sm text-gray-600">
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

