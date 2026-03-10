"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BlueprintNameInput } from "./blueprint-name-input";
import { CategoryInputs } from "./category-inputs";
import { BlueprintImageUpload } from "./blueprint-image-upload";
import { AdvancedBlueprintInputs } from "./advanced-blueprint-inputs";
import { createBlueprintAction } from "@/app/crafting/blueprints/actions";
import Link from "next/link";

export function NewBlueprintForm({
  tAdmin,
}: {
  tAdmin: Record<string, string>;
}) {
  const [slug, setSlug] = useState("");

  return (
    <form
      action={async (formData: FormData) => {
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;
        const category = formData.get("category") as string;
        const subcategory =
          (formData.get("subcategory") as string) || undefined;
        const slug = formData.get("slug") as string;
        const imageUrl = (formData.get("imageUrl") as string) || undefined;
        const tier = Number(formData.get("tier") ?? 0);
        const craftingTimeRaw = formData.get("craftingTime") as string;
        const craftingTime = craftingTimeRaw
          ? Number(craftingTimeRaw)
          : undefined;
        const statisticsRaw = formData.get("statistics") as string;
        const statistics = statisticsRaw
          ? JSON.parse(statisticsRaw)
          : undefined;
        const recipeRaw = formData.get("recipe") as string;
        const recipe = recipeRaw ? JSON.parse(recipeRaw) : undefined;

        await createBlueprintAction({
          name,
          description,
          category,
          subcategory,
          slug,
          imageUrl,
          tier,
          craftingTime,
          statistics,
          recipe,
        });
      }}
      className="space-y-5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">{tAdmin.fieldName}</Label>
        <BlueprintNameInput />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{tAdmin.fieldDescription}</Label>
        <Textarea id="description" name="description" rows={4} required />
      </div>

      <CategoryInputs
        tCategory={tAdmin.fieldCategory}
        tSubcategory={tAdmin.fieldSubcategory}
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
        <BlueprintImageUpload slug={slug} />
      </div>

      <AdvancedBlueprintInputs tLabels={tAdmin} />

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit">{tAdmin.newCreate}</Button>
        <Button asChild variant="outline">
          <Link href="/crafting/blueprints">{tAdmin.editCancel}</Link>
        </Button>
      </div>
    </form>
  );
}
