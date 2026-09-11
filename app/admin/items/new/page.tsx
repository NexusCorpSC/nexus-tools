import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { requirePermission } from "@/lib/permissions";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";
import { ItemForm } from "../components/item-form";

export const metadata: Metadata = {
  title: "Nouvel objet",
  description: "Ajoutez un objet, une arme ou un véhicule au catalogue.",
  robots: { index: false, follow: false },
};

export default async function NewItemPage() {
  await requirePermission(ITEMS_EDIT_PERMISSION);

  const t = await getTranslations("Items");

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
            <BreadcrumbPage>{t("Admin.newPageTitle")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold">{t("Admin.newPageTitle")}</h1>

      <ItemForm />
    </div>
  );
}
