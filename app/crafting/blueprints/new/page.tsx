import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/permissions";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NewBlueprintForm } from "./new-blueprint-form";

export default async function NewBlueprintPage() {
  await requirePermission("blueprints:edit");

  const t = await getTranslations("Crafting");
  const tAdmin = await getTranslations("Crafting.Blueprints.Admin");

  const tAdminMap = {
    fieldName: tAdmin("fieldName"),
    fieldDescription: tAdmin("fieldDescription"),
    fieldCategory: tAdmin("fieldCategory"),
    fieldSubcategory: tAdmin("fieldSubcategory"),
    fieldSlug: tAdmin("fieldSlug"),
    fieldImage: tAdmin("fieldImage"),
    newCreate: tAdmin("newCreate"),
    editCancel: tAdmin("editCancel"),
  };

  return (
    <div className="m-2 p-6 max-w-2xl mx-auto bg-white rounded-xl shadow-md space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/crafting">{t("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/crafting/blueprints">
              {t("Blueprints.title")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{tAdmin("newPageTitle")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold text-gray-900">
        {tAdmin("newPageTitle")}
      </h1>

      <NewBlueprintForm tAdmin={tAdminMap} />
    </div>
  );
}
