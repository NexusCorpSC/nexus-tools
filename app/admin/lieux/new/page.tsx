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
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import { PlaceForm } from "../components/place-form";

export const metadata: Metadata = {
  title: "Nouveau lieu",
  description: "Ajoutez un lieu au catalogue du 'verse.",
  robots: { index: false, follow: false },
};

export default async function NewPlacePage() {
  await requirePermission(PLACES_EDIT_PERMISSION);

  const t = await getTranslations("Places");

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/lieux">
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

      <PlaceForm />
    </div>
  );
}
