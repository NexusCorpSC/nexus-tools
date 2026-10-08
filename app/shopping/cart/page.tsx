import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getCartGroups } from "@/lib/cart";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ListLink } from "@/components/list-link";
import { Button } from "@/components/ui/button";
import { MUTED, PAGE_PANEL } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import { CartForm } from "./cart-form";

export const metadata: Metadata = {
  title: "Panier",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/shopping/cart")}`);
  }

  const t = await getTranslations("Cart");
  const tShopping = await getTranslations("Shopping");
  const groups = await getCartGroups(new ObjectId(session.user.id));
  const count = groups.reduce(
    (sum, group) =>
      sum + group.lines.reduce((lines, line) => lines + line.quantity, 0),
    0,
  );

  return (
    <div className={cn(PAGE_PANEL, "max-w-6xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{tShopping("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <ListLink href="/shopping">{tShopping("title")}</ListLink>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {groups.length > 0 && (
          <p className={MUTED}>
            {t("summary", { count, shops: groups.length })}
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <div className={cn("py-10 text-center", MUTED)}>
          <p>{t("empty")}</p>
          <Button asChild className="mt-4" variant="outline">
            <ListLink href="/shopping">{t("backToShopping")}</ListLink>
          </Button>
        </div>
      ) : (
        <CartForm groups={groups} />
      )}
    </div>
  );
}
