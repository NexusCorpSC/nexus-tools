import { isUserSellerOfShop, ShopItem } from "@/lib/shop-items";
import { ObjectId } from "bson";
import { StockModificationForm } from "@/app/shopping/i/[itemId]/components";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function StockModificationSection({ item }: { item: ShopItem }) {
  const t = await getTranslations("ShopItemManagement");

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return <></>;
  }

  if (await isUserSellerOfShop(item.shop.id, new ObjectId(session.user.id))) {
    return (
      <>
        <p>
          {t("currentStock")}
          {item.stock}
        </p>
        <StockModificationForm itemId={item.id} />
      </>
    );
  }

  return <></>;
}
