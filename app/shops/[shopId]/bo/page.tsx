import { redirect } from "next/navigation";

/** Le back-office s'ouvre sur les commandes à traiter. */
export default async function BoHomePage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  redirect(`/shops/${shopId}/bo/orders`);
}
