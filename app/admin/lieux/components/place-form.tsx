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
import {
  MAX_PLACE_TIP_LENGTH,
  MAX_SOLD_ITEMS,
  PLACE_SERVICES,
  PLACE_TYPES,
  toPlaceSlug,
} from "@/types/places";
import type { Place, PlaceService, PlaceType } from "@/types/places";
import { PlaceImageUpload } from "./place-image-upload";
import { PlacePicker } from "@/app/lieux/place-picker";
import {
  ItemMultiPicker,
  type PickedItem,
} from "@/app/items/item-multi-picker";
import {
  ContributionMetaFields,
  useContribute,
  type ContributionMetaValue,
} from "@/app/contributions/contribute-kit";

/**
 * Le formulaire sert aussi aux contributions. Il propose alors au lieu
 * d'écrire : pas de slug (il suit le nom), pas de vignette (elle vient de la
 * galerie), et le nom comme le parent restent fixes en deçà du niveau 4.
 */
type ResumedContribution = {
  /** La contribution reprise, renvoyée à corriger ou encore en attente. */
  contributionId?: string;
  /** Ce qu'elle proposait, par-dessus la fiche. */
  initial?: Partial<Place>;
  source?: string;
  gameVersion?: string;
};

export type PlaceContribution =
  | ({
      mode: "create";
      parentSlug: string;
      parentName: string;
    } & ResumedContribution)
  | ({ mode: "edit"; canRename: boolean } & ResumedContribution);

export function PlaceForm({
  place: published,
  parentName,
  contribution,
  itemNames = {},
}: {
  place?: Place;
  parentName?: string;
  contribution?: PlaceContribution;
  /** Le nom des objets vendus, par slug, pour les montrer sans les relire. */
  itemNames?: Record<string, string>;
}) {
  const t = useTranslations("Places");
  const tForm = useTranslations("Contributions.Form");
  const router = useRouter();
  const { contribute, errorMessage } = useContribute();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const place: Partial<Place> | undefined = contribution?.initial
    ? { ...published, ...contribution.initial }
    : published;
  const locked = contribution?.mode === "edit" && !contribution.canRename;
  const [meta, setMeta] = useState<ContributionMetaValue>({
    source: contribution?.source ?? "",
    gameVersion: contribution?.gameVersion ?? "",
  });

  const [name, setName] = useState(place?.name ?? "");
  const [slug, setSlug] = useState(place?.slug ?? "");
  // Le slug suit le nom tant que personne ne l'a touché ; en édition il est
  // déjà l'adresse d'une fiche, donc il ne bouge plus tout seul.
  const [slugEdited, setSlugEdited] = useState(!!place);
  const [type, setType] = useState<PlaceType>(place?.type ?? "outpost");
  const [parentSlug, setParentSlug] = useState(
    contribution?.mode === "create"
      ? contribution.parentSlug
      : place?.parentSlug,
  );
  const [parentLabel, setParentLabel] = useState(
    contribution?.mode === "create"
      ? contribution.parentName
      : (parentName ?? place?.parentName),
  );
  const [description, setDescription] = useState(place?.description ?? "");
  const [shopCategory, setShopCategory] = useState(place?.shopCategory ?? "");
  const [soldItems, setSoldItems] = useState<PickedItem[]>(
    (place?.soldItems ?? []).map((slug) => ({
      slug,
      name: itemNames[slug] ?? slug,
    })),
  );
  const [tip, setTip] = useState(place?.tip ?? "");
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
      if (contribution) {
        const input = {
          name,
          type,
          parentSlug: parentSlug ?? null,
          description,
          shopCategory,
          soldItems: soldItems.map((item) => item.slug),
          tip,
          services,
        };
        const result =
          contribution.mode === "create"
            ? await contribute(
                {
                  kind: "placeCreate",
                  parentSlug: contribution.parentSlug,
                  input,
                },
                { ...meta, contributionId: contribution.contributionId },
              )
            : await contribute(
                { kind: "placeEdit", slug: published!.slug, input },
                { ...meta, contributionId: contribution.contributionId },
              );
        if (!result.ok) {
          setError(errorMessage(result));
          return;
        }
        const { contribution: sent } = result;
        // Un lieu proposé n'a pas encore de fiche : on revient à son parent.
        router.push(
          sent.kind === "placeCreate" && sent.status !== "published"
            ? `/lieux/${sent.target.parent?.slug ?? ""}`
            : `/lieux/${sent.target.slug}`,
        );
        router.refresh();
        return;
      }

      const input = {
        name,
        slug,
        type,
        parentSlug: parentSlug ?? null,
        description,
        shopCategory,
        soldItems: soldItems.map((item) => item.slug),
        tip,
        imageUrl,
        services,
      };

      const result = published
        ? await updatePlaceAction(published.slug, input)
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
            disabled={locked}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugEdited) setSlug(toPlaceSlug(event.target.value));
            }}
          />
        </div>

        {locked && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {tForm("renameLocked")}
          </p>
        )}

        {!contribution && (
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
        )}

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
            disabled={locked || contribution?.mode === "create"}
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

      {type === "shop" && (
        <div className="space-y-1.5">
          <Label>{t("Admin.fieldSoldItems")}</Label>
          <ItemMultiPicker
            value={soldItems}
            onChange={setSoldItems}
            max={MAX_SOLD_ITEMS}
            placeholder={t("Admin.fieldSoldItemsPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("Admin.fieldSoldItemsHint")}
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

      <div className="space-y-1.5">
        <Label htmlFor="place-tip">{t("Admin.fieldTip")}</Label>
        <Textarea
          id="place-tip"
          rows={3}
          maxLength={MAX_PLACE_TIP_LENGTH}
          value={tip}
          onChange={(event) => setTip(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t("Admin.fieldTipHint")}
        </p>
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

      {contribution ? (
        <ContributionMetaFields value={meta} onChange={setMeta} />
      ) : (
        <div className="space-y-1.5">
          <Label>{t("Admin.fieldImage")}</Label>
          <PlaceImageUpload
            slug={slug}
            imageUrl={imageUrl}
            onChange={setImageUrl}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-2 border-t border-[#9ED0FF]/15 pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? t("Admin.saving")
            : contribution
              ? tForm("submit")
              : published
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
