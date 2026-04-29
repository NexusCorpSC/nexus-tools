import { getTranslations } from "next-intl/server";
import { getOrdersForUser, countOrdersForUser } from "@/lib/shop-orders";
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

const PAGE_SIZE = 15;

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  QUOTED: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REFUSED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

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
  const userId = new ObjectId(session.user.id);

  const [orders, total] = await Promise.all([
    getOrdersForUser(userId, { offset, limit: PAGE_SIZE }),
    countOrdersForUser(userId),
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
            <BreadcrumbLink href="/shopping">{t("shopping")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {orders.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
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
              className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                    {order.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                  {order.quote !== undefined && (
                    <p className="text-sm font-medium text-green-700 mt-1">
                      {t("quote")} : {order.quote} aUEC
                    </p>
                  )}
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
              <Link href={`/shopping/my-orders?page=${page - 1}`}>
                {t("prev")}
              </Link>
            </Button>
          )}
          <span className="text-sm text-gray-600">
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
