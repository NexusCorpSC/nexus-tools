import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/permissions";
import { getItemDetails } from "@/lib/items";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";
import { ItemForm } from "../../components/item-form";

export const metadata: Metadata = {
  title: "Modifier un objet",
  description: "Modifiez un objet, une arme ou un véhicule du catalogue.",
  robots: { index: false, follow: false },
};

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission(ITEMS_EDIT_PERMISSION);

  const t = await getTranslations("Items");
  const { slug } = await params;
  const item = await getItemDetails(slug);

  if (!item) {
    return (
      <div className="m-2 mx-auto max-w-3xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="text-2xl font-bold">{t("notFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/admin/items">{t("Admin.managerTitle")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/items">
              {t("Admin.managerTitle")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{item.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold">{t("Admin.editPageTitle")}</h1>

      <ItemForm
        item={item}
        blueprints={item.blueprintsInferred ? [] : item.blueprints}
      />
    </div>
  );
}
