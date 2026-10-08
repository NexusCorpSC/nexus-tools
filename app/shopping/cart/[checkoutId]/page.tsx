import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import { getFormatter, getTranslations } from "next-intl/server";
import { CheckIcon } from "@heroicons/react/24/outline";
import { auth } from "@/lib/auth";
import { getOrdersOfCheckout } from "@/lib/shop-orders";
import { getShopNames } from "@/lib/shop-items";
import { Button } from "@/components/ui/button";
import { ListLink } from "@/components/list-link";
import {
  MUTED,
  OrderStatusBadge,
  PAGE_PANEL,
  ROW_LINK,
} from "@/app/shopping/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Panier validé",
  robots: { index: false, follow: false },
};

/** Les commandes créées par la validation d'un panier, une par magasin. */
export default async function CheckoutDonePage({
  params,
}: {
  params: Promise<{ checkoutId: string }>;
}) {
  const { checkoutId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/shopping/cart/${checkoutId}`)}`,
    );
  }

  const t = await getTranslations("Cart");
  const tOrders = await getTranslations("Orders");
  const format = await getFormatter();
  const orders = await getOrdersOfCheckout(
    new ObjectId(session.user.id),
    checkoutId,
  );

  if (orders.length === 0) {
    return (
      <div className={cn(PAGE_PANEL, "max-w-3xl")}>
        <p>{t("doneNotFound")}</p>
        <Button asChild variant="outline">
          <Link href="/shopping/my-orders">{t("followOrders")}</Link>
        </Button>
      </div>
    );
  }

  const shopNames = await getShopNames(orders.map((order) => order.shopId));
  const total = orders.reduce((sum, order) => sum + (order.total ?? 0), 0);

  return (
    <div className={cn(PAGE_PANEL, "max-w-3xl")}>
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-emerald-300/50">
          <CheckIcon aria-hidden="true" className="size-6 text-emerald-200" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {t("doneTitle", { count: orders.length })}
          </h1>
          <p className={MUTED}>{t("doneText")}</p>
        </div>
      </div>

      <ul className="space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              href={`/shopping/my-orders/${order.id}`}
              className={cn(
                ROW_LINK,
                "flex flex-wrap items-center gap-x-5 gap-y-2",
              )}
            >
              <span className="min-w-0 flex-[1_1_260px]">
                <span className="block font-semibold text-[#CCE7FF]">
                  {shopNames.get(order.shopId)}
                </span>
                <span className={cn("block text-sm", MUTED)}>
                  {order.message}
                  {order.pickup &&
                    ` · ${
                      order.pickup.proposed
                        ? t("pickupProposed", { name: order.pickup.name })
                        : order.pickup.name
                    }`}
                </span>
              </span>
              <OrderStatusBadge
                status={order.status}
                label={tOrders(`status.${order.status}`)}
              />
              <span className="w-28 text-right font-mono font-bold">
                {format.number(order.total ?? 0)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between px-1">
        <span className={MUTED}>
          {t("doneTotal", { count: orders.length })}
        </span>
        <span className="font-mono text-xl font-bold text-[#CFE8FF]">
          {format.number(total)} aUEC
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/shopping/my-orders">{t("followOrders")}</Link>
        </Button>
        <Button asChild variant="outline">
          <ListLink href="/shopping">{t("backToShopping")}</ListLink>
        </Button>
      </div>
    </div>
  );
}
