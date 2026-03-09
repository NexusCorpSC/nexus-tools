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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { createBlueprintAction } from "@/app/crafting/blueprints/actions";
import { BlueprintNameInput } from "./blueprint-name-input";

export default async function NewBlueprintPage() {
  await requirePermission("blueprints:edit");

  const t = await getTranslations("Crafting");
  const tAdmin = await getTranslations("Crafting.Blueprints.Admin");

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

      <form
        action={async (formData: FormData) => {
          "use server";
          const name = formData.get("name") as string;
          const description = formData.get("description") as string;
          const category = formData.get("category") as string;
          const subcategory =
            (formData.get("subcategory") as string) || undefined;
          const slug = formData.get("slug") as string;

          await createBlueprintAction({
            name,
            description,
            category,
            subcategory,
            slug,
          });
        }}
        className="space-y-5"
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">{tAdmin("fieldName")}</Label>
          <BlueprintNameInput />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">{tAdmin("fieldDescription")}</Label>
          <Textarea id="description" name="description" rows={4} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">{tAdmin("fieldCategory")}</Label>
          <Input id="category" name="category" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subcategory">{tAdmin("fieldSubcategory")}</Label>
          <Input id="subcategory" name="subcategory" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">{tAdmin("fieldSlug")}</Label>
          <Input id="slug" name="slug" required />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit">{tAdmin("newCreate")}</Button>
          <Button asChild variant="outline">
            <Link href="/crafting/blueprints">{tAdmin("editCancel")}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
