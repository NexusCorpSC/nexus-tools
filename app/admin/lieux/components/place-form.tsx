"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPlaceAction, updatePlaceAction } from "@/app/lieux/actions";
import { PLACE_SERVICES, PLACE_TYPES, toPlaceSlug } from "@/types/places";
import type { Place, PlaceService, PlaceType } from "@/types/places";
import { PlaceImageUpload } from "./place-image-upload";
import { PlacePicker } from "./place-picker";

export function PlaceForm({
  place,
  parentName,
}: {
  place?: Place;
  parentName?: string;
}) {
  const t = useTranslations("Places");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(place?.name ?? "");
  const [slug, setSlug] = useState(place?.slug ?? "");
  // Le slug suit le nom tant que personne ne l'a touché ; en édition il est
  // déjà l'adresse d'une fiche, donc il ne bouge plus tout seul.
  const [slugEdited, setSlugEdited] = useState(!!place);
  const [type, setType] = useState<PlaceType>(place?.type ?? "outpost");
  const [parentSlug, setParentSlug] = useState(place?.parentSlug);
  const [parentLabel, setParentLabel] = useState(
    parentName ?? place?.parentName,
  );
  const [description, setDescription] = useState(place?.description ?? "");
  const [shopCategory, setShopCategory] = useState(place?.shopCategory ?? "");
  const [imageUrl, setImageUrl] = useState(place?.imageUrl);
  const [services, setServices] = useState<PlaceService[]>(
    place?.services ?? [],
  );

  const toggleService = (service: PlaceService) =>
    setServices((current) =>
      current.includes(service)
        ? current.filter((entry) => entry !== service)
        : [...current, service],
    );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const input = {
        name,
        slug,
        type,
        parentSlug: parentSlug ?? null,
        description,
        shopCategory,
        imageUrl,
        services,
      };

      const result = place
        ? await updatePlaceAction(place.slug, input)
        : await createPlaceAction(input);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(`/lieux/${result.slug}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="place-name">{t("Admin.fieldName")}</Label>
          <Input
            id="place-name"
            value={name}
            required
            onChange={(event) => {
              setName(event.target.value);
              if (!slugEdited) setSlug(toPlaceSlug(event.target.value));
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="place-slug">{t("Admin.fieldSlug")}</Label>
          <Input
            id="place-slug"
            value={slug}
            required
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("Admin.fieldSlugHint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="place-type">{t("Admin.fieldType")}</Label>
          <Select
            value={type}
            onValueChange={(value) => setType(value as PlaceType)}
          >
            <SelectTrigger id="place-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLACE_TYPES.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {t(`types.${entry}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("Admin.fieldParent")}</Label>
          <PlacePicker
            value={parentSlug}
            valueLabel={parentLabel}
            exclude={place?.slug}
            onChange={(next) => {
              setParentSlug(next?.slug);
              setParentLabel(next?.name);
            }}
            placeholder={t("Admin.fieldParentNone")}
          />
          <p className="text-xs text-muted-foreground">
            {t("Admin.fieldParentHint")}
          </p>
        </div>
      </div>

      {type === "shop" && (
        <div className="space-y-1.5">
          <Label htmlFor="place-shop-category">
            {t("Admin.fieldShopCategory")}
          </Label>
          <Input
            id="place-shop-category"
            value={shopCategory}
            onChange={(event) => setShopCategory(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t("Admin.fieldShopCategoryHint")}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="place-description">{t("Admin.fieldDescription")}</Label>
        <Textarea
          id="place-description"
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {t("Admin.fieldServices")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PLACE_SERVICES.map((service) => (
            <label
              key={service}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#9ED0FF]/15 px-3 py-2 text-sm transition-colors hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={services.includes(service)}
                onChange={() => toggleService(service)}
                className="size-4 accent-[#C2E2FF]"
              />
              {t(`services.${service}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label>{t("Admin.fieldImage")}</Label>
        <PlaceImageUpload
          slug={slug}
          imageUrl={imageUrl}
          onChange={setImageUrl}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-2 border-t border-[#9ED0FF]/15 pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? t("Admin.saving")
            : place
              ? t("Admin.editSave")
              : t("Admin.newCreate")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.back()}
        >
          {t("Admin.cancel")}
        </Button>
      </div>
    </form>
  );
}
