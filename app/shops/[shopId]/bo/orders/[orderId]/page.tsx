import { getTranslations } from "next-intl/server";
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

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  QUOTED: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REFUSED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
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

  const [shop, order] = await Promise.all([
    getShop(shopId),
    getOrderById(orderId),
  ]);

  if (!shop || !order || order.shopId !== shopId) {
    notFound();
  }

  const canRespond = order.status === "PENDING" || order.status === "QUOTED";

  return (
    <div className="m-2 p-6 max-w-2xl mx-auto bg-white rounded-xl shadow-md space-y-6">
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
            <BreadcrumbLink href={`/shops/${shopId}/bo/orders`}>
              {t("title")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("orderDetail")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("orderDetail")}</h1>
        <span
          className={`px-3 py-1 rounded text-sm font-semibold ${STATUS_COLORS[order.status] ?? "bg-gray-100"}`}
        >
          {t(`status.${order.status}`)}
        </span>
      </div>

      <div className="space-y-1 text-sm text-gray-500">
        <p>
          {t("from")} : <span className="font-medium text-gray-800">{order.userName}</span>
        </p>
        <p>{t("date")} : {new Date(order.createdAt).toLocaleString()}</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("customerMessage")}</h2>
        <div className="rounded-lg bg-gray-50 border p-4 text-sm whitespace-pre-wrap">
          {order.message}
        </div>
      </div>

      {order.response && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("currentResponse")}</h2>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm whitespace-pre-wrap">
            {order.response}
          </div>
          {order.quote !== undefined && (
            <p className="text-sm font-medium">
              {t("currentQuote")} : {order.quote} aUEC
            </p>
          )}
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

