import { getBlueprintBySlug } from "@/lib/crafting";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { EditBlueprintForm } from "./edit-blueprint-form";

export default async function EditBlueprintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("blueprints:edit");

  const t = await getTranslations("Crafting.Blueprints");
  const tAdmin = await getTranslations("Crafting.Blueprints.Admin");
  const { slug } = await params;

  const blueprint = await getBlueprintBySlug(slug);

  if (!blueprint) {
    redirect("/crafting/blueprints");
  }

  const tAdminMap = {
    fieldName: tAdmin("fieldName"),
    fieldDescription: tAdmin("fieldDescription"),
    fieldObtention: tAdmin("fieldObtention"),
    fieldCategory: tAdmin("fieldCategory"),
    fieldSubcategory: tAdmin("fieldSubcategory"),
    fieldSlug: tAdmin("fieldSlug"),
    fieldImage: tAdmin("fieldImage"),
    editSave: tAdmin("editSave"),
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
              {t("title")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/crafting/blueprints/${blueprint.slug}`}>
              {blueprint.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{tAdmin("editPageTitle")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold text-gray-900">
        {tAdmin("editPageTitle")}
      </h1>

      <EditBlueprintForm blueprint={blueprint} tAdmin={tAdminMap} />
    </div>
  );
}
