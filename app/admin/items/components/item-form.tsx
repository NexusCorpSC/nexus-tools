"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { createItemAction, updateItemAction } from "@/app/items/actions";
import {
  ITEM_KINDS,
  toItemSlug,
  type Item,
  type ItemBlueprintLink,
  type ItemFacets,
  type ItemKind,
} from "@/types/items";
import { BlueprintPicker, type BlueprintOption } from "./blueprint-picker";
import { ItemImageUpload } from "./item-image-upload";
import {
  StatisticsEditor,
  rowsToStatistics,
  statisticsToRows,
  type StatRow,
} from "./statistics-editor";
import {
  AMMUNITION_KEYS,
  REFINING_KEYS,
  RESOURCE_KEYS,
  SPREAD_KEYS,
  ResourceFields,
  VEHICLE_KEYS,
  VEHICLE_PLAN_KEYS,
  VehicleFields,
  WEAPON_KEYS,
  WeaponFields,
  buildKindPayload,
  extractionToRows,
  fireModesToRows,
  marketsToRows,
  profileToRows,
  scalarsToRow,
  slotsToRows,
  type EditorRow,
} from "./kind-fields";

const EMPTY_FACETS: ItemFacets = {
  categories: [],
  manufacturers: [],
  variantGroups: [],
  sets: [],
};

/** Free-text input backed by the values already used by other items. */
function SuggestInput({
  id,
  value,
  onChange,
  suggestions,
  required,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  required?: boolean;
  placeholder?: string;
}) {
  const listId = `${id}-suggestions`;

  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </>
  );
}

export function ItemForm({
  item,
  blueprints = [],
}: {
  /** Absent when creating. */
  item?: Item;
  /** Blueprints already linked, so their chips can show a name. */
  blueprints?: ItemBlueprintLink[];
}) {
  const t = useTranslations("Items.Admin");
  const tItems = useTranslations("Items");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [facets, setFacets] = useState<ItemFacets>(EMPTY_FACETS);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(item?.name ?? "");
  const [slug, setSlug] = useState(item?.slug ?? "");
  // While creating, the slug follows the name until it is edited by hand.
  const [slugEdited, setSlugEdited] = useState(!!item);
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? "item");
  const [category, setCategory] = useState(item?.category ?? "");
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? "");
  const [manufacturer, setManufacturer] = useState(item?.manufacturer ?? "");
  const [tier, setTier] = useState(item?.tier?.toString() ?? "");
  const [size, setSize] = useState(item?.size?.toString() ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [obtention, setObtention] = useState(item?.obtention ?? "");
  const [imageUrl, setImageUrl] = useState<string | undefined>(item?.imageUrl);
  const [statRows, setStatRows] = useState<StatRow[]>(
    statisticsToRows(item?.statistics),
  );
  const [linkedBlueprints, setLinkedBlueprints] = useState<BlueprintOption[]>(
    blueprints.map(({ slug: blueprintSlug, name: blueprintName }) => ({
      slug: blueprintSlug,
      name: blueprintName,
    })),
  );
  const [variantGroup, setVariantGroup] = useState(item?.variantGroup ?? "");
  const [variantName, setVariantName] = useState(item?.variantName ?? "");
  // Named `setLabel` to stay clear of the `name` state setter above.
  const [setLabel, setSetLabel] = useState(item?.setName ?? "");

  // Kind-specific blocks. Each one is edited as strings and rebuilt on submit;
  // only the block matching the selected kind is sent.
  const [vehicle, setVehicle] = useState<EditorRow>(() =>
    scalarsToRow(item?.vehicle, VEHICLE_KEYS),
  );
  const [vehiclePlans, setVehiclePlans] = useState<EditorRow>(() =>
    scalarsToRow(item?.vehicle?.plans, VEHICLE_PLAN_KEYS),
  );
  const [hardpoints, setHardpoints] = useState<EditorRow[]>(() =>
    slotsToRows(item?.vehicle?.hardpoints),
  );
  const [components, setComponents] = useState<EditorRow[]>(() =>
    slotsToRows(item?.vehicle?.components),
  );
  const [weapon, setWeapon] = useState<EditorRow>(() =>
    scalarsToRow(item?.weapon, WEAPON_KEYS),
  );
  const [profile, setProfile] = useState<EditorRow[]>(() =>
    profileToRows(item?.weapon?.profile),
  );
  const [attachments, setAttachments] = useState<EditorRow[]>(() =>
    slotsToRows(item?.weapon?.attachments),
  );
  const [fireModes, setFireModes] = useState<EditorRow[]>(() =>
    fireModesToRows(item?.weapon?.fireModes),
  );
  const [spread, setSpread] = useState<EditorRow>(() =>
    scalarsToRow(item?.weapon?.spread, SPREAD_KEYS),
  );
  const [adsSpread, setAdsSpread] = useState<EditorRow>(() =>
    scalarsToRow(item?.weapon?.adsSpread, SPREAD_KEYS),
  );
  const [ammunition, setAmmunition] = useState<EditorRow>(() =>
    scalarsToRow(item?.weapon?.ammunition, AMMUNITION_KEYS),
  );
  const [resource, setResource] = useState<EditorRow>(() =>
    scalarsToRow(item?.resource, RESOURCE_KEYS),
  );
  const [refining, setRefining] = useState<EditorRow>(() =>
    scalarsToRow(item?.resource?.refining, REFINING_KEYS),
  );
  const [markets, setMarkets] = useState<EditorRow[]>(() =>
    marketsToRows(item?.resource?.markets),
  );
  const [extraction, setExtraction] = useState<EditorRow[]>(() =>
    extractionToRows(item?.resource?.extraction),
  );
  const [priceHistory, setPriceHistory] = useState(
    (item?.resource?.priceHistory ?? []).join(", "),
  );

  useEffect(() => {
    fetch("/api/items/facets")
      .then((response) => response.json())
      .then((data: ItemFacets) => setFacets(data))
      .catch(() => {});
  }, []);

  const subcategories =
    facets.categories.find((entry) => entry.category === category)
      ?.subcategories ?? [];

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(toItemSlug(value));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input = {
      name,
      slug,
      kind,
      category,
      subcategory,
      manufacturer,
      tier,
      size,
      description,
      obtention,
      imageUrl,
      statistics: rowsToStatistics(statRows),
      blueprintSlugs: linkedBlueprints.map((blueprint) => blueprint.slug),
      variantGroup,
      variantName,
      // The set key is derived from its name: two items typing the same set
      // name end up in the same set without anyone managing identifiers.
      setId: toItemSlug(setLabel),
      setName: setLabel,
      ...buildKindPayload(kind, {
        vehicle,
        vehiclePlans,
        hardpoints,
        components,
        weapon,
        profile,
        attachments,
        fireModes,
        spread,
        adsSpread,
        ammunition,
        resource,
        refining,
        markets,
        extraction,
        priceHistory,
      }),
    };

    startTransition(async () => {
      const result = item
        ? await updateItemAction(item.slug, input)
        : await createItemAction(input);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(`/items/${result.slug}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">{t("fieldName")}</Label>
        <Input
          id="name"
          value={name}
          required
          autoComplete="off"
          onChange={(event) => handleNameChange(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">{t("fieldSlug")}</Label>
        <Input
          id="slug"
          value={slug}
          required
          autoComplete="off"
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
        />
        <p className="text-xs text-nexus">{t("fieldSlugHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kind">{t("fieldKind")}</Label>
        <Select
          value={kind}
          onValueChange={(value) => setKind(value as ItemKind)}
        >
          <SelectTrigger id="kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ITEM_KINDS.map((option) => (
              <SelectItem key={option} value={option}>
                {tItems(`kinds.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">{t("fieldCategory")}</Label>
          <SuggestInput
            id="category"
            value={category}
            required
            onChange={(value) => {
              setCategory(value);
              setSubcategory("");
            }}
            suggestions={facets.categories.map((entry) => entry.category)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subcategory">{t("fieldSubcategory")}</Label>
          <SuggestInput
            id="subcategory"
            value={subcategory}
            onChange={setSubcategory}
            suggestions={subcategories}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="manufacturer">{t("fieldManufacturer")}</Label>
          <SuggestInput
            id="manufacturer"
            value={manufacturer}
            onChange={setManufacturer}
            suggestions={facets.manufacturers}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tier">{t("fieldTier")}</Label>
          <Input
            id="tier"
            type="number"
            min={0}
            value={tier}
            onChange={(event) => setTier(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="size">{t("fieldSize")}</Label>
          <Input
            id="size"
            type="number"
            min={0}
            value={size}
            onChange={(event) => setSize(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{t("fieldDescription")}</Label>
        <Textarea
          id="description"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="obtention">{t("fieldObtention")}</Label>
        <Textarea
          id="obtention"
          rows={3}
          value={obtention}
          onChange={(event) => setObtention(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("fieldImage")}</Label>
        <ItemImageUpload
          slug={slug}
          imageUrl={imageUrl}
          onChange={setImageUrl}
        />
      </div>

      {kind === "vehicle" && (
        <VehicleFields
          scalars={vehicle}
          onScalars={setVehicle}
          plans={vehiclePlans}
          onPlans={setVehiclePlans}
          hardpoints={hardpoints}
          onHardpoints={setHardpoints}
          components={components}
          onComponents={setComponents}
        />
      )}

      {kind === "weapon" && (
        <WeaponFields
          scalars={weapon}
          onScalars={setWeapon}
          profile={profile}
          onProfile={setProfile}
          attachments={attachments}
          onAttachments={setAttachments}
          fireModes={fireModes}
          onFireModes={setFireModes}
          spread={spread}
          onSpread={setSpread}
          adsSpread={adsSpread}
          onAdsSpread={setAdsSpread}
          ammunition={ammunition}
          onAmmunition={setAmmunition}
        />
      )}

      {kind === "resource" && (
        <ResourceFields
          scalars={resource}
          onScalars={setResource}
          refining={refining}
          onRefining={setRefining}
          markets={markets}
          onMarkets={setMarkets}
          extraction={extraction}
          onExtraction={setExtraction}
          priceHistory={priceHistory}
          onPriceHistory={setPriceHistory}
        />
      )}

      <StatisticsEditor rows={statRows} onChange={setStatRows} />

      <BlueprintPicker
        value={linkedBlueprints}
        onChange={setLinkedBlueprints}
      />

      <fieldset className="space-y-3 rounded-xl border border-[#9ED0FF]/15 p-4">
        <legend className="px-1 text-sm font-medium">
          {t("variantsLegend")}
        </legend>
        <p className="text-xs text-nexus">{t("variantsHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="variantGroup">{t("fieldVariantGroup")}</Label>
            <SuggestInput
              id="variantGroup"
              value={variantGroup}
              onChange={setVariantGroup}
              suggestions={facets.variantGroups.map((entry) => entry.id)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="variantName">{t("fieldVariantName")}</Label>
            <Input
              id="variantName"
              value={variantName}
              autoComplete="off"
              onChange={(event) => setVariantName(event.target.value)}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-[#9ED0FF]/15 p-4">
        <legend className="px-1 text-sm font-medium">{t("setLegend")}</legend>
        <p className="text-xs text-nexus">{t("setHint")}</p>
        <div className="space-y-1.5">
          <Label htmlFor="setName">{t("fieldSetName")}</Label>
          <SuggestInput
            id="setName"
            value={setLabel}
            onChange={setSetLabel}
            suggestions={facets.sets.map((entry) => entry.name)}
          />
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : item ? t("editSave") : t("newCreate")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/items">{t("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
