import { getTranslations } from "next-intl/server";
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
import { OrderActions } from "../components";

export const metadata: Metadata = {
  title: "Détail de commande",
  description: "Consultez le détail de votre commande sur le Marketplace Nexus Tools.",
  robots: { index: false, follow: false },
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  QUOTED: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REFUSED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
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
  const order = await getOrderById(orderId);

  if (!order || order.userId !== session.user.id) {
    notFound();
  }

  const shop = await getShop(order.shopId);

  return (
    <div className="m-2 p-6 max-w-2xl mx-auto bg-white rounded-xl shadow-md space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/shopping/my-orders">
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
        {shop && (
          <p>
            {t("shop")} :{" "}
            <a
              href={`/shops/${shop.id}`}
              className="font-medium text-blue-600 hover:underline"
            >
              {shop.name}
            </a>
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
        <div className="rounded-lg bg-gray-50 border p-4 text-sm whitespace-pre-wrap">
          {order.message}
        </div>
      </div>

      {order.response && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("shopResponse")}</h2>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm whitespace-pre-wrap">
            {order.response}
          </div>
          {order.quote !== undefined && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-sm font-semibold text-green-800">
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
