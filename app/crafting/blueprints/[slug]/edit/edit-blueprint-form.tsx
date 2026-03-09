"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoryInputs } from "@/app/crafting/blueprints/new/category-inputs";
import { BlueprintImageUpload } from "@/app/crafting/blueprints/new/blueprint-image-upload";
import { updateBlueprintAction } from "@/app/crafting/blueprints/actions";
import { Blueprint } from "@/types/crafting";
import Link from "next/link";

export function EditBlueprintForm({
  blueprint,
  tAdmin,
}: {
  blueprint: Blueprint;
  tAdmin: Record<string, string>;
}) {
  const [slug, setSlug] = useState(blueprint.slug);

  return (
    <form
      action={async (formData: FormData) => {
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;
        const category = formData.get("category") as string;
        const subcategory =
          (formData.get("subcategory") as string) || undefined;
        const newSlug = formData.get("slug") as string;
        const imageUrl = (formData.get("imageUrl") as string) || undefined;

        await updateBlueprintAction(blueprint.id, blueprint.slug, {
          name,
          description,
          category,
          subcategory,
          slug: newSlug,
          imageUrl,
        });
      }}
      className="space-y-5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">{tAdmin.fieldName}</Label>
        <Input id="name" name="name" defaultValue={blueprint.name} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{tAdmin.fieldDescription}</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={blueprint.description}
          rows={4}
          required
        />
      </div>

      <CategoryInputs
        tCategory={tAdmin.fieldCategory}
        tSubcategory={tAdmin.fieldSubcategory}
        initialCategory={blueprint.category}
        initialSubcategory={blueprint.subcategory}
      />

      <div className="space-y-1.5">
        <Label htmlFor="slug">{tAdmin.fieldSlug}</Label>
        <Input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label>{tAdmin.fieldImage}</Label>
        <BlueprintImageUpload slug={slug} initialUrl={blueprint.imageUrl} />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit">{tAdmin.editSave}</Button>
        <Button asChild variant="outline">
          <Link href={`/crafting/blueprints/${blueprint.slug}`}>
            {tAdmin.editCancel}
          </Link>
        </Button>
      </div>
    </form>
  );
}
