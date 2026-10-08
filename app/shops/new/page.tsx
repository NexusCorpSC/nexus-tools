import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import { getTranslations } from "next-intl/server";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import type { ShopDbModel } from "@/lib/shop-items";
import { MAX_OWNED_SHOPS } from "@/lib/shops";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { MUTED, PAGE_PANEL } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import { NewShopForm } from "./shop-form";

export const metadata: Metadata = {
  title: "Ouvrir un magasin",
  description: "Ouvrez votre magasin sur le Marketplace Nexus Tools.",
  robots: { index: false, follow: false },
};

/** Tout joueur connecté ouvre son magasin ici. */
export default async function NewShopPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/shops/new")}`);
  }

  const t = await getTranslations("ShopCreate");
  const tShopping = await getTranslations("Shopping");
  const owned = await db
    .db()
    .collection<ShopDbModel>("shops")
    .find(
      { ownerId: new ObjectId(session.user.id) },
      { projection: { id: 1, name: 1 } },
    )
    .toArray();

  return (
    <div className={cn(PAGE_PANEL, "max-w-2xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/shopping">{tShopping("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className={MUTED}>{t("intro")}</p>
      </div>

      {owned.length >= MAX_OWNED_SHOPS ? (
        <div className="space-y-3">
          <p>{t("limitReached", { count: MAX_OWNED_SHOPS })}</p>
          <div className="flex flex-wrap gap-2">
            {owned.map((shop) => (
              <Button key={shop.id} asChild variant="outline">
                <Link href={`/shops/${shop.id}/bo`}>
                  {t("openBackOffice", { name: shop.name })}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <NewShopForm />
          <p className={cn("text-xs", MUTED)}>{t("rules")}</p>
        </>
      )}
    </div>
  );
}
