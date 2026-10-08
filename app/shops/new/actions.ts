"use server";

import { ObjectId } from "bson";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  checkLogo,
  cleanShopName,
  createShop,
  type ShopFormError,
} from "@/lib/shops";

/** Ouvre le magasin du joueur, puis l'emmène dans son back-office. */
export async function createShopAction(
  formData: FormData,
): Promise<{ error?: ShopFormError | "NOT_AUTHENTICATED" }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { error: "NOT_AUTHENTICATED" };

  const logo = checkLogo(formData.get("logo"));
  if (logo === "invalid") return { error: "LOGO_INVALID" };

  const result = await createShop({
    ownerId: new ObjectId(session.user.id),
    name: cleanShopName(String(formData.get("name") ?? "")),
    description: String(formData.get("description") ?? "").trim(),
    logo: logo ?? undefined,
  });
  if (result.error) return { error: result.error };

  revalidatePath("/shopping");
  revalidatePath("/shopping/sell");
  redirect(`/shops/${result.id}/bo/listings`);
}
