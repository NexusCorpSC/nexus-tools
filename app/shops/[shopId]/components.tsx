import { headers } from "next/headers";
import { isUserSellerOfShop } from "@/lib/shop-items";
import { auth } from "@/lib/auth";
import { ObjectId } from "bson";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function ShopButtons({ shopId }: { shopId: string }) {
  const t = await getTranslations("ShopDetails");
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isSeller =
    session?.user?.id &&
    (await isUserSellerOfShop(shopId, new ObjectId(session.user.id)));

  if (!isSeller) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <Button asChild>
        <Link href={`/shops/${shopId}/bo`}>{t("backOffice")}</Link>
      </Button>
      <Button asChild>
        <Link href={`/shops/${shopId}/manage`}>{t("manage")}</Link>
      </Button>
    </div>
  );
}
