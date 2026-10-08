import { redirect } from "next/navigation";

/** L'ancienne page de gestion : le profil et les vendeurs sont dans le back-office. */
export default async function ShopManagementRedirect({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  redirect(`/shops/${shopId}/bo/profile`);
}
