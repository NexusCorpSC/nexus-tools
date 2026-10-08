import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ListLink } from "@/components/list-link";
import { getShop } from "@/lib/shop-items";
import { getOrderById } from "@/lib/shop-orders";
import { OrderView } from "@/app/shopping/order-view";

export const metadata: Metadata = {
  title: "Détail de commande — Back-office",
  description:
    "Consultez et répondez aux commandes de vos clients sur Nexus Tools.",
  robots: { index: false, follow: false },
};

/** Une commande vue par le magasin ; le back-office a vérifié l'accès. */
export default async function BoOrderDetailPage({
  params,
}: {
  params: Promise<{ shopId: string; orderId: string }>;
}) {
  const { shopId, orderId } = await params;
  const t = await getTranslations("ShopBo.orders");

  const [shop, order] = await Promise.all([
    getShop(shopId),
    getOrderById(orderId),
  ]);

  if (!shop || !order || order.shopId !== shopId) {
    notFound();
  }

  return (
    <>
      <ListLink
        href={`/shops/${shopId}/bo/orders`}
        className="text-sm text-[#CCE7FF] hover:underline"
      >
        {t("backToBoard")}
      </ListLink>
      <OrderView
        order={order}
        role="seller"
        shop={{ id: shop.id, name: shop.name }}
      />
    </>
  );
}
