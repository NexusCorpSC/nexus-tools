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
  const shop = await getShop(shopId);

  if (!shop) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md">
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
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
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
        <p className="text-gray-500 mt-1">{shop.name}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="group flex flex-col gap-3 rounded-xl border p-5 hover:border-orange-400 hover:bg-orange-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-700 group-hover:bg-orange-200 transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="font-semibold text-gray-900">{tool.label}</span>
              </div>
              <p className="text-sm text-gray-500">{tool.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

