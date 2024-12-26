import { auth } from "@/auth";
import { isUserSellerOfShop, ShopItem } from "@/lib/shop-items";
import { ObjectId } from "bson";
import { StockModificationForm } from "@/app/shopping/i/[itemId]/components";

export async function StockModificationSection({ item }: { item: ShopItem }) {
  const session = await auth();

  if (!session?.user) {
    return <></>;
  }

  if (await isUserSellerOfShop(item.shop.id, new ObjectId(session.user.id))) {
    return (
      <>
        <p>Stock actuel : {item.stock}</p>
        <StockModificationForm itemId={item.id} />
      </>
    );
  }

  return <></>;
}
