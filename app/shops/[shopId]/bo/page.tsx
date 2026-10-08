import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { getShop, isUserSellerOfShop } from "@/lib/shop-items";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ClipboardList } from "lucide-react";
import { MUTED, PAGE_PANEL, ROW_LINK } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Back-office",
  description: "Tableau de bord de gestion de votre boutique sur Nexus Tools.",
  robots: { index: false, follow: false },
};

export default async function BoDashboardPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const isSeller = await isUserSellerOfShop(shopId, new ObjectId(session.user.id));
  if (!isSeller) {
    redirect(`/shops/${shopId}`);
  }

  const t = await getTranslations("BoDashboard");
  const tShopping = await getTranslations("Shopping");
  const shop = await getShop(shopId);

  if (!shop) {
    return (
      <div className={cn(PAGE_PANEL, "max-w-4xl")}>
        <p>{t("shopNotFound")}</p>
      </div>
    );
  }

  const tools = [
    {
      href: `/shops/${shopId}/bo/orders`,
      label: t("tools.orders.label"),
      description: t("tools.orders.description"),
      icon: ClipboardList,
    },
  ];

  return (
    <div className={cn(PAGE_PANEL, "max-w-4xl")}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{tShopping("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/shops/${shopId}`}>{shop.name}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className={cn("mt-1", MUTED)}>{shop.name}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className={cn(ROW_LINK, "flex flex-col gap-3 p-5")}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#9ED0FF]/12 text-[#CCE7FF]">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="font-semibold text-[#CCE7FF]">{tool.label}</span>
              </div>
              <p className={cn("text-sm", MUTED)}>{tool.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

