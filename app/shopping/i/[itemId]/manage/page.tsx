import { notFound, redirect } from "next/navigation";
import { getShopItem } from "@/lib/shop-items";

/** L'ancienne page de gestion : l'annonce se gère dans le back-office. */
export default async function ManageListingRedirect({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const item = await getShopItem(itemId);
  if (!item) notFound();
  redirect(`/shops/${item.shop.id}/bo/listings/${item.id}`);
}
