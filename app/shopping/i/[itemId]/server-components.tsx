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
    return null;
  }

  if (await isUserSellerOfShop(item.shop.id, new ObjectId(session.user.id))) {
    return (
      <div className="space-y-3 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 p-4">
        <p className="text-sm">
          {t("currentStock")}{" "}
          <span className="font-mono font-semibold">{item.stock}</span>
        </p>
        <StockModificationForm itemId={item.id} />
      </div>
    );
  }

  return null;
}
