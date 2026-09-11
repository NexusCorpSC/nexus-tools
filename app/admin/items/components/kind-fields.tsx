"use client";

import { useTranslations } from "next-intl";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXTRACTION_FREQUENCIES,
  RESOURCE_MARKET_SIDES,
  type Item,
  type ItemSlot,
  type ResourceExtraction,
  type ResourceMarket,
  type WeaponFireMode,
  type WeaponStat,
} from "@/types/items";

/** A row of a repeatable list, kept as strings because it comes from inputs. */
export type EditorRow = Record<string, string>;

type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "number" | "checkbox";
  placeholder?: string;
  step?: string;
};

type ColumnSpec = FieldSpec & {
  /** Share of the row's width, as a flex-basis percentage. */
  basis?: number;
  options?: { value: string; label: string }[];
};

function FieldGrid({
  fields,
  values,
  onChange,
  columns = 3,
}: {
  fields: FieldSpec[];
  values: EditorRow;
  onChange: (values: EditorRow) => void;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      className={`grid items-end gap-3 sm:grid-cols-2 ${
        columns === 4 ? "lg:grid-cols-4" : columns === 3 ? "lg:grid-cols-3" : ""
      }`}
    >
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          {field.type === "checkbox" ? (
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values[field.key] === "true"}
                onChange={(event) =>
                  onChange({
                    ...values,
                    [field.key]: event.target.checked ? "true" : "false",
                  })
                }
                className="size-4 rounded border-[#9ED0FF]/40 bg-transparent"
              />
              {field.label}
            </label>
          ) : (
            <>
              <Label htmlFor={`field-${field.key}`}>{field.label}</Label>
              <Input
                id={`field-${field.key}`}
                type={field.type === "number" ? "number" : "text"}
                step={field.step}
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
                autoComplete="off"
                onChange={(event) =>
                  onChange({ ...values, [field.key]: event.target.value })
                }
              />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * A repeatable list of rows — hardpoints, market prices, extraction sites.
 * One editor for every list on the fiche, so they all behave the same.
 */
export function RowsEditor({
  label,
  hint,
  columns,
  rows,
  onChange,
  addLabel,
}: {
  label: string;
  hint?: string;
  columns: ColumnSpec[];
  rows: EditorRow[];
  onChange: (rows: EditorRow[]) => void;
  addLabel: string;
}) {
  const t = useTranslations("Items.Admin");

  const update = (index: number, patch: EditorRow) =>
    onChange(
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-nexus">{hint}</p>}

      {rows.map((row, index) => (
        <div
          key={index}
          className="flex flex-wrap items-center gap-2 rounded-md border border-[#9ED0FF]/10 bg-white/[0.02] p-2"
        >
          {columns.map((column) => (
            <div
              key={column.key}
              style={{ flexBasis: `${column.basis ?? 20}%` }}
              className="min-w-28 flex-1"
            >
              {column.options ? (
                <select
                  aria-label={column.label}
                  value={row[column.key] ?? column.options[0].value}
                  onChange={(event) =>
                    update(index, { [column.key]: event.target.value })
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring"
                >
                  {column.options.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-nexus-bg"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  aria-label={column.label}
                  type={column.type === "number" ? "number" : "text"}
                  step={column.step}
                  placeholder={column.placeholder ?? column.label}
                  value={row[column.key] ?? ""}
                  autoComplete="off"
                  onChange={(event) =>
                    update(index, { [column.key]: event.target.value })
                  }
                />
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label={t("removeRow")}
            onClick={() =>
              onChange(rows.filter((_, position) => position !== index))
            }
          >
            <TrashIcon className="size-4 text-red-500" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, {}])}
      >
        <PlusIcon className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}

// ─── Conversions between the stored shapes and the editor rows ───────────────

export function slotsToRows(slots?: ItemSlot[]): EditorRow[] {
  return (slots ?? []).map((slot) => ({
    label: slot.label,
    size: slot.size?.toString() ?? "",
    itemSlug: slot.itemSlug ?? "",
    itemName: slot.itemName ?? "",
    quantity: slot.quantity?.toString() ?? "",
    note: slot.note ?? "",
  }));
}

export function profileToRows(profile?: WeaponStat[]): EditorRow[] {
  return (profile ?? []).map((stat) => ({
    label: stat.label,
    value: stat.value.toString(),
    unit: stat.unit ?? "",
  }));
}

export function fireModesToRows(modes?: WeaponFireMode[]): EditorRow[] {
  return (modes ?? []).map((mode) => ({
    label: mode.label,
    rpm: mode.rpm?.toString() ?? "",
    dps: mode.dps?.toString() ?? "",
    ammoPerShot: mode.ammoPerShot?.toString() ?? "",
    pelletsPerShot: mode.pelletsPerShot?.toString() ?? "",
    burstCount: mode.burstCount?.toString() ?? "",
    heatPerShot: mode.heatPerShot?.toString() ?? "",
  }));
}

export function marketsToRows(markets?: ResourceMarket[]): EditorRow[] {
  return (markets ?? []).map((market) => ({
    location: market.location,
    side: market.side,
    price: market.price.toString(),
    stock: market.stock?.toString() ?? "",
  }));
}

export function extractionToRows(sites?: ResourceExtraction[]): EditorRow[] {
  return (sites ?? []).map((site) => ({
    location: site.location,
    method: site.method ?? "",
    frequency: site.frequency ?? "common",
  }));
}

/** Scalars of a details block, flattened to the strings the inputs hold. */
export function scalarsToRow(
  source: Record<string, unknown> | undefined,
  keys: string[],
): EditorRow {
  const values: EditorRow = {};
  for (const key of keys) {
    const value = source?.[key];
    values[key] = value === undefined || value === null ? "" : String(value);
  }
  return values;
}

export const VEHICLE_KEYS = [
  "crew",
  "speedMax",
  "speedScm",
  "cargoScu",
  "mass",
  "length",
  "width",
  "height",
];

export const WEAPON_KEYS = [
  "damageType",
  "caliber",
  "rateOfFire",
  "magazine",
  "reloadTime",
  "mass",
];

export const SPREAD_KEYS = ["min", "max", "firstShot", "perShot", "decay"];

export const AMMUNITION_KEYS = [
  "damageType",
  "damagePerShot",
  "speed",
  "range",
  "lifetime",
  "capacity",
  "size",
  "penetration",
  "falloffStart",
  "falloffPerMeter",
  "falloffMinDamage",
];

export const RESOURCE_KEYS = [
  "form",
  "volatile",
  "unitVolumeScu",
  "purityMin",
  "purityMax",
  "transportNote",
];

export const REFINING_KEYS = [
  "process",
  "yield",
  "durationSeconds",
  "cost",
  "outputName",
];

// ─── The three kind-specific blocks of the admin form ────────────────────────

export function VehicleFields({
  scalars,
  onScalars,
  hardpoints,
  onHardpoints,
  components,
  onComponents,
}: {
  scalars: EditorRow;
  onScalars: (values: EditorRow) => void;
  hardpoints: EditorRow[];
  onHardpoints: (rows: EditorRow[]) => void;
  components: EditorRow[];
  onComponents: (rows: EditorRow[]) => void;
}) {
  const t = useTranslations("Items.Admin");
  const slotColumns: ColumnSpec[] = [
    { key: "label", label: t("slotLabel"), basis: 26 },
    { key: "size", label: t("slotSize"), type: "number", basis: 8 },
    { key: "itemSlug", label: t("slotItemSlug"), basis: 18 },
    { key: "itemName", label: t("slotItemName"), basis: 18 },
    { key: "quantity", label: t("slotQuantity"), type: "number", basis: 8 },
    { key: "note", label: t("slotNote"), basis: 14 },
  ];

  return (
    <fieldset className="space-y-4 rounded-xl border border-[#9ED0FF]/15 p-4">
      <legend className="px-1 text-sm font-medium">{t("vehicleLegend")}</legend>
      <p className="text-xs text-nexus">{t("vehicleHint")}</p>

      <FieldGrid
        columns={4}
        values={scalars}
        onChange={onScalars}
        fields={[
          { key: "crew", label: t("vehicleCrew"), type: "number" },
          { key: "speedMax", label: t("vehicleSpeedMax"), type: "number" },
          { key: "speedScm", label: t("vehicleSpeedScm"), type: "number" },
          { key: "cargoScu", label: t("vehicleCargo"), type: "number" },
          { key: "mass", label: t("vehicleMass"), type: "number" },
          {
            key: "length",
            label: t("vehicleLength"),
            type: "number",
            step: "0.1",
          },
          {
            key: "width",
            label: t("vehicleWidth"),
            type: "number",
            step: "0.1",
          },
          {
            key: "height",
            label: t("vehicleHeight"),
            type: "number",
            step: "0.1",
          },
        ]}
      />

      <RowsEditor
        label={t("hardpoints")}
        hint={t("hardpointsHint")}
        columns={slotColumns}
        rows={hardpoints}
        onChange={onHardpoints}
        addLabel={t("addHardpoint")}
      />

      <RowsEditor
        label={t("components")}
        hint={t("componentsHint")}
        columns={slotColumns}
        rows={components}
        onChange={onComponents}
        addLabel={t("addComponent")}
      />
    </fieldset>
  );
}

export function WeaponFields({
  scalars,
  onScalars,
  profile,
  onProfile,
  attachments,
  onAttachments,
  fireModes,
  onFireModes,
  spread,
  onSpread,
  adsSpread,
  onAdsSpread,
  ammunition,
  onAmmunition,
}: {
  scalars: EditorRow;
  onScalars: (values: EditorRow) => void;
  profile: EditorRow[];
  onProfile: (rows: EditorRow[]) => void;
  attachments: EditorRow[];
  onAttachments: (rows: EditorRow[]) => void;
  fireModes: EditorRow[];
  onFireModes: (rows: EditorRow[]) => void;
  spread: EditorRow;
  onSpread: (values: EditorRow) => void;
  adsSpread: EditorRow;
  onAdsSpread: (values: EditorRow) => void;
  ammunition: EditorRow;
  onAmmunition: (values: EditorRow) => void;
}) {
  const t = useTranslations("Items.Admin");
  const tw = useTranslations("Items.Weapon");
  const spreadFields: FieldSpec[] = [
    { key: "min", label: tw("spreadMin"), type: "number", step: "0.01" },
    { key: "max", label: tw("spreadMax"), type: "number", step: "0.01" },
    {
      key: "firstShot",
      label: tw("spreadFirst"),
      type: "number",
      step: "0.01",
    },
    { key: "perShot", label: tw("spreadPer"), type: "number", step: "0.01" },
    { key: "decay", label: tw("spreadDecay"), type: "number", step: "0.1" },
  ];

  return (
    <fieldset className="space-y-4 rounded-xl border border-[#9ED0FF]/15 p-4">
      <legend className="px-1 text-sm font-medium">{t("weaponLegend")}</legend>
      <p className="text-xs text-nexus">{t("weaponHint")}</p>

      <FieldGrid
        columns={3}
        values={scalars}
        onChange={onScalars}
        fields={[
          { key: "damageType", label: t("weaponDamageType") },
          { key: "caliber", label: t("weaponCaliber") },
          { key: "rateOfFire", label: t("weaponRateOfFire"), type: "number" },
          { key: "magazine", label: t("weaponMagazine"), type: "number" },
          {
            key: "reloadTime",
            label: t("weaponReload"),
            type: "number",
            step: "0.1",
          },
          {
            key: "mass",
            label: t("weaponMass"),
            type: "number",
            step: "0.1",
          },
        ]}
      />

      <RowsEditor
        label={t("weaponProfile")}
        hint={t("weaponProfileHint")}
        columns={[
          { key: "label", label: t("profileLabel"), basis: 45 },
          { key: "value", label: t("profileValue"), type: "number", basis: 20 },
          { key: "unit", label: t("profileUnit"), basis: 15 },
        ]}
        rows={profile}
        onChange={onProfile}
        addLabel={t("addProfileStat")}
      />

      <RowsEditor
        label={t("attachments")}
        hint={t("attachmentsHint")}
        columns={[
          { key: "label", label: t("slotLabel"), basis: 26 },
          { key: "itemSlug", label: t("slotItemSlug"), basis: 20 },
          { key: "itemName", label: t("slotItemName"), basis: 20 },
          { key: "note", label: t("slotNote"), basis: 24 },
        ]}
        rows={attachments}
        onChange={onAttachments}
        addLabel={t("addAttachment")}
      />

      <RowsEditor
        label={t("fireModes")}
        hint={t("fireModesHint")}
        columns={[
          { key: "label", label: tw("modeLabel"), basis: 18 },
          { key: "rpm", label: tw("modeRpm"), type: "number", basis: 13 },
          {
            key: "dps",
            label: tw("modeDps"),
            type: "number",
            step: "0.1",
            basis: 13,
          },
          {
            key: "ammoPerShot",
            label: tw("modeAmmo"),
            type: "number",
            basis: 13,
          },
          {
            key: "pelletsPerShot",
            label: tw("modePellets"),
            type: "number",
            basis: 13,
          },
          {
            key: "burstCount",
            label: tw("modeBurst"),
            type: "number",
            basis: 11,
          },
          {
            key: "heatPerShot",
            label: tw("modeHeat"),
            type: "number",
            step: "0.1",
            basis: 11,
          },
        ]}
        rows={fireModes}
        onChange={onFireModes}
        addLabel={t("addFireMode")}
      />

      <div className="space-y-3">
        <Label>{t("spreadLegend")}</Label>
        <p className="text-xs text-nexus">{t("spreadHint")}</p>
        <p className="text-xs font-medium">{t("spreadHipLegend")}</p>
        <FieldGrid
          columns={4}
          values={spread}
          onChange={onSpread}
          fields={spreadFields}
        />
        <p className="text-xs font-medium">{t("spreadAdsLegend")}</p>
        <FieldGrid
          columns={4}
          values={adsSpread}
          onChange={onAdsSpread}
          fields={spreadFields}
        />
      </div>

      <div className="space-y-3">
        <Label>{t("ammunitionLegend")}</Label>
        <p className="text-xs text-nexus">{t("ammunitionHint")}</p>
        <FieldGrid
          columns={4}
          values={ammunition}
          onChange={onAmmunition}
          fields={[
            { key: "damageType", label: tw("ammoDamage") },
            {
              key: "damagePerShot",
              label: `${tw("ammoDamage")} ${tw("spreadPer").toLowerCase()}`,
              type: "number",
              step: "0.1",
            },
            { key: "speed", label: `${tw("ammoSpeed")} (m/s)`, type: "number" },
            { key: "range", label: `${tw("ammoRange")} (m)`, type: "number" },
            {
              key: "lifetime",
              label: `${tw("ammoLifetime")} (s)`,
              type: "number",
              step: "0.1",
            },
            { key: "capacity", label: tw("ammoCapacity"), type: "number" },
            { key: "size", label: tw("ammoSize"), type: "number" },
            {
              key: "penetration",
              label: tw("ammoPenetration"),
              type: "number",
              step: "0.1",
            },
            {
              key: "falloffStart",
              label: `${tw("falloffTitle")} — ${tw("spreadFirst").toLowerCase()} (m)`,
              type: "number",
            },
            {
              key: "falloffPerMeter",
              label: `${tw("falloffTitle")} — / m`,
              type: "number",
              step: "0.001",
            },
            {
              key: "falloffMinDamage",
              label: `${tw("falloffTitle")} — ${tw("falloffFloor").toLowerCase()}`,
              type: "number",
              step: "0.1",
            },
          ]}
        />
      </div>
    </fieldset>
  );
}

export function ResourceFields({
  scalars,
  onScalars,
  refining,
  onRefining,
  markets,
  onMarkets,
  extraction,
  onExtraction,
  priceHistory,
  onPriceHistory,
}: {
  scalars: EditorRow;
  onScalars: (values: EditorRow) => void;
  refining: EditorRow;
  onRefining: (values: EditorRow) => void;
  markets: EditorRow[];
  onMarkets: (rows: EditorRow[]) => void;
  extraction: EditorRow[];
  onExtraction: (rows: EditorRow[]) => void;
  priceHistory: string;
  onPriceHistory: (value: string) => void;
}) {
  const t = useTranslations("Items.Admin");
  const tr = useTranslations("Items.Resource");

  return (
    <fieldset className="space-y-4 rounded-xl border border-[#9ED0FF]/15 p-4">
      <legend className="px-1 text-sm font-medium">
        {t("resourceLegend")}
      </legend>
      <p className="text-xs text-nexus">{t("resourceHint")}</p>

      <FieldGrid
        columns={3}
        values={scalars}
        onChange={onScalars}
        fields={[
          { key: "form", label: t("resourceForm") },
          { key: "volatile", label: t("resourceVolatile"), type: "checkbox" },
          {
            key: "unitVolumeScu",
            label: t("resourceUnitVolume"),
            type: "number",
            step: "0.001",
          },
          { key: "purityMin", label: t("resourcePurityMin"), type: "number" },
          { key: "purityMax", label: t("resourcePurityMax"), type: "number" },
          { key: "transportNote", label: t("resourceTransportNote") },
        ]}
      />

      <RowsEditor
        label={t("markets")}
        hint={t("marketsHint")}
        columns={[
          { key: "location", label: t("marketLocation"), basis: 38 },
          {
            key: "side",
            label: t("marketSide"),
            basis: 16,
            options: RESOURCE_MARKET_SIDES.map((side) => ({
              value: side,
              label: tr(`sides.${side}`),
            })),
          },
          {
            key: "price",
            label: t("marketPrice"),
            type: "number",
            step: "0.01",
            basis: 16,
          },
          { key: "stock", label: t("marketStock"), type: "number", basis: 14 },
        ]}
        rows={markets}
        onChange={onMarkets}
        addLabel={t("addMarket")}
      />

      <div className="space-y-1.5">
        <Label htmlFor="priceHistory">{t("priceHistory")}</Label>
        <Input
          id="priceHistory"
          value={priceHistory}
          autoComplete="off"
          placeholder="24.1, 25.4, 24.9, 27.4"
          onChange={(event) => onPriceHistory(event.target.value)}
        />
        <p className="text-xs text-nexus">{t("priceHistoryHint")}</p>
      </div>

      <div className="space-y-3">
        <Label>{t("refining")}</Label>
        <FieldGrid
          columns={3}
          values={refining}
          onChange={onRefining}
          fields={[
            { key: "process", label: t("refiningProcess") },
            { key: "yield", label: t("refiningYield"), type: "number" },
            {
              key: "durationSeconds",
              label: t("refiningDuration"),
              type: "number",
            },
            { key: "cost", label: t("refiningCost"), type: "number" },
            { key: "outputName", label: t("refiningOutput") },
          ]}
        />
      </div>

      <RowsEditor
        label={t("extraction")}
        hint={t("extractionHint")}
        columns={[
          { key: "location", label: t("extractionLocation"), basis: 34 },
          { key: "method", label: t("extractionMethod"), basis: 34 },
          {
            key: "frequency",
            label: t("extractionFrequency"),
            basis: 20,
            options: EXTRACTION_FREQUENCIES.map((frequency) => ({
              value: frequency,
              label: tr(`frequencies.${frequency}`),
            })),
          },
        ]}
        rows={extraction}
        onChange={onExtraction}
        addLabel={t("addExtraction")}
      />
    </fieldset>
  );
}

/** Rebuilds the nested blocks the server expects from the editor's rows. */
export function buildKindPayload(
  kind: Item["kind"],
  state: {
    vehicle: EditorRow;
    hardpoints: EditorRow[];
    components: EditorRow[];
    weapon: EditorRow;
    profile: EditorRow[];
    attachments: EditorRow[];
    fireModes: EditorRow[];
    spread: EditorRow;
    adsSpread: EditorRow;
    ammunition: EditorRow;
    resource: EditorRow;
    refining: EditorRow;
    markets: EditorRow[];
    extraction: EditorRow[];
    priceHistory: string;
  },
) {
  switch (kind) {
    case "vehicle":
      return {
        vehicle: {
          ...state.vehicle,
          hardpoints: state.hardpoints,
          components: state.components,
        },
      };
    case "weapon":
      return {
        weapon: {
          ...state.weapon,
          profile: state.profile,
          attachments: state.attachments,
          fireModes: state.fireModes,
          spread: state.spread,
          adsSpread: state.adsSpread,
          ammunition: state.ammunition,
        },
      };
    case "resource":
      return {
        resource: {
          ...state.resource,
          refining: state.refining,
          markets: state.markets,
          extraction: state.extraction,
          priceHistory: state.priceHistory,
        },
      };
    default:
      return {};
  }
}
