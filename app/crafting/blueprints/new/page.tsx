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
    fieldTier: tAdmin("fieldTier"),
    fieldCraftingTime: tAdmin("fieldCraftingTime"),
    craftingTimePlaceholder: tAdmin("craftingTimePlaceholder"),
    craftingTimeHint: tAdmin("craftingTimeHint"),
    craftingTimeInvalid: tAdmin("craftingTimeInvalid"),
    seconds: tAdmin("seconds"),
    fieldStatistics: tAdmin("fieldStatistics"),
    fieldStatisticsHint: tAdmin("fieldStatisticsHint"),
    statName: tAdmin("statName"),
    statValue: tAdmin("statValue"),
    statUnit: tAdmin("statUnit"),
    addStat: tAdmin("addStat"),
    fieldRecipe: tAdmin("fieldRecipe"),
    fieldRecipeHint: tAdmin("fieldRecipeHint"),
    componentName: tAdmin("componentName"),
    componentQuantity: tAdmin("componentQuantity"),
    componentMinQuality: tAdmin("componentMinQuality"),
    componentMinQualityPlaceholder: tAdmin("componentMinQualityPlaceholder"),
    addComponent: tAdmin("addComponent"),
  };

  return (
    <div className="m-2 mx-auto max-w-2xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
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
