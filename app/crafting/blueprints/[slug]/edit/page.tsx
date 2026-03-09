import { getBlueprintBySlug } from "@/lib/crafting";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/permissions";
import { redirect } from "next/navigation";
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
import { updateBlueprintAction } from "@/app/crafting/blueprints/actions";

export default async function EditBlueprintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect("/crafting/blueprints");
  }

  const t = await getTranslations("Crafting.Blueprints");
  const tAdmin = await getTranslations("Crafting.Blueprints.Admin");
  const { slug } = await params;

  const blueprint = await getBlueprintBySlug(slug);

  if (!blueprint) {
    redirect("/crafting/blueprints");
  }

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

      <form
        action={async (formData: FormData) => {
          "use server";
          const name = formData.get("name") as string;
          const description = formData.get("description") as string;
          const category = formData.get("category") as string;
          const subcategory =
            (formData.get("subcategory") as string) || undefined;
          const newSlug = formData.get("slug") as string;

          await updateBlueprintAction(blueprint.id, blueprint.slug, {
            name,
            description,
            category,
            subcategory,
            slug: newSlug,
          });
        }}
        className="space-y-5"
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">{tAdmin("fieldName")}</Label>
          <Input id="name" name="name" defaultValue={blueprint.name} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">{tAdmin("fieldDescription")}</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={blueprint.description}
            rows={4}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">{tAdmin("fieldCategory")}</Label>
          <Input
            id="category"
            name="category"
            defaultValue={blueprint.category}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subcategory">{tAdmin("fieldSubcategory")}</Label>
          <Input
            id="subcategory"
            name="subcategory"
            defaultValue={blueprint.subcategory ?? ""}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">{tAdmin("fieldSlug")}</Label>
          <Input id="slug" name="slug" defaultValue={blueprint.slug} required />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit">{tAdmin("editSave")}</Button>
          <Button asChild variant="outline">
            <Link href={`/crafting/blueprints/${blueprint.slug}`}>
              {tAdmin("editCancel")}
            </Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
