"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { BlueprintStatistics, BlueprintRecipeStep } from "@/types/crafting";
import { parseCraftingTime, formatCraftingTime } from "@/lib/crafting-time";

/* ─────────────────────────────────────────
   Generic autocomplete input
   Fetches suggestions from an API endpoint
   using the Combobox shadcn component
───────────────────────────────────────── */
function AutocompleteInput({
  value,
  onChange,
  placeholder,
  apiPath,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  /** e.g. "/api/blueprints/stat-names" */
  apiPath: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState(value);

  // Keep local input in sync when parent value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      try {
        const res = await fetch(`${apiPath}?query=${encodeURIComponent(q)}`);
        const data: string[] = await res.json();
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      }
    },
    [apiPath],
  );

  return (
    <div className={className}>
      <Combobox
        value={value}
        onValueChange={(val) => {
          const v = val ?? "";
          onChange(v);
          setInputValue(v);
        }}
      >
        <ComboboxInput
          placeholder={placeholder}
          autoComplete="off"
          showTrigger={false}
          value={inputValue}
          onChange={(e) => {
            const v = e.target.value;
            setInputValue(v);
            onChange(v);
            fetchSuggestions(v);
          }}
          onFocus={() => fetchSuggestions(inputValue)}
        />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxEmpty />
            {suggestions.map((s) => (
              <ComboboxItem key={s} value={s}>
                {s}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

/* ─────────────────────────────────────────
   Statistics editor
───────────────────────────────────────── */
type StatRow = { name: string; value: string; unit: string };

function StatisticsEditor({
  tLabels,
  initial,
}: {
  tLabels: Record<string, string>;
  initial?: BlueprintStatistics;
}) {
  const toRows = (stats?: BlueprintStatistics): StatRow[] =>
    stats
      ? Object.entries(stats).map(([name, v]) => ({
          name,
          value: String(v.value),
          unit: v.unit ?? "",
        }))
      : [];

  const [rows, setRows] = useState<StatRow[]>(toRows(initial));

  function add() {
    setRows((r) => [...r, { name: "", value: "", unit: "" }]);
  }

  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function update(i: number, key: keyof StatRow, val: string) {
    setRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)),
    );
  }

  const serialized: BlueprintStatistics = {};
  rows.forEach((r) => {
    if (r.name) {
      serialized[r.name] = {
        value:
          isNaN(Number(r.value)) || r.value === "" ? r.value : Number(r.value),
        ...(r.unit ? { unit: r.unit } : {}),
      };
    }
  });

  return (
    <div className="space-y-2">
      <input
        type="hidden"
        name="statistics"
        value={JSON.stringify(serialized)}
      />
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <AutocompleteInput
            value={row.name}
            onChange={(v) => update(i, "name", v)}
            placeholder={tLabels.statName}
            apiPath="/api/blueprints/stat-names"
            className="flex-1"
          />
          <Input
            placeholder={tLabels.statValue}
            value={row.value}
            onChange={(e) => update(i, "value", e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder={tLabels.statUnit}
            value={row.unit}
            onChange={(e) => update(i, "unit", e.target.value)}
            className="w-24"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-red-500 hover:text-red-700"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <PlusIcon className="size-4 mr-1.5" />
        {tLabels.addStat}
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────
   Recipe editor
   Unit = dropdown: "SCU" | "Pièce(s)" | "" (none)
   Default unit: "SCU"
───────────────────────────────────────── */
const RECIPE_UNIT_NONE = "__none__";
const RECIPE_UNITS = ["SCU", "Pièce(s)"] as const;

type RecipeRow = {
  component: string;
  quantity: string;
  unit: string;
  minQuality: string;
};

function RecipeEditor({
  tLabels,
  initial,
}: {
  tLabels: Record<string, string>;
  initial?: BlueprintRecipeStep[];
}) {
  const toRows = (steps?: BlueprintRecipeStep[]): RecipeRow[] => {
    if (!steps) return [];
    return steps.flatMap((step) =>
      Object.entries(step).map(([component, v]) => ({
        component,
        quantity: String(v.quantity),
        unit: v.unit ?? "SCU",
        minQuality: v.minQuality !== undefined ? String(v.minQuality) : "",
      })),
    );
  };

  const [rows, setRows] = useState<RecipeRow[]>(toRows(initial));

  function add() {
    setRows((r) => [
      ...r,
      { component: "", quantity: "", unit: "SCU", minQuality: "" },
    ]);
  }

  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function update(i: number, key: keyof RecipeRow, val: string) {
    setRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)),
    );
  }

  const serialized: BlueprintRecipeStep[] = rows
    .filter((r) => r.component)
    .map((r) => ({
      [r.component]: {
        quantity: parseFloat(r.quantity) || 0,
        ...(r.unit && r.unit !== RECIPE_UNIT_NONE ? { unit: r.unit } : {}),
        ...(r.minQuality !== ""
          ? { minQuality: parseInt(r.minQuality, 10) || 0 }
          : {}),
      },
    }));

  return (
    <div className="space-y-2">
      <input type="hidden" name="recipe" value={JSON.stringify(serialized)} />
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <AutocompleteInput
            value={row.component}
            onChange={(v) => update(i, "component", v)}
            placeholder={tLabels.componentName}
            apiPath="/api/blueprints/component-names"
            className="flex-1"
          />
          <Input
            type="number"
            min={0}
            step="any"
            placeholder={tLabels.componentQuantity}
            value={row.quantity}
            onChange={(e) => update(i, "quantity", e.target.value)}
            className="w-28"
          />
          <Select
            value={row.unit || RECIPE_UNIT_NONE}
            onValueChange={(v) =>
              update(i, "unit", v === RECIPE_UNIT_NONE ? "" : v)
            }
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder={tLabels.componentUnitNone} />
            </SelectTrigger>
            <SelectContent>
              {RECIPE_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
              <SelectItem value={RECIPE_UNIT_NONE}>
                {tLabels.componentUnitNone}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step={1}
            placeholder={tLabels.componentMinQualityPlaceholder ?? "500"}
            value={row.minQuality}
            onChange={(e) => update(i, "minQuality", e.target.value)}
            className="w-24"
            title={tLabels.componentMinQuality}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-red-500 hover:text-red-700"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <PlusIcon className="size-4 mr-1.5" />
        {tLabels.addComponent}
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────
   Crafting time input
   Accepts "1j2h30m15s" text, stores seconds
───────────────────────────────────────── */
function CraftingTimeInput({
  tLabels,
  initialSeconds,
}: {
  tLabels: Record<string, string>;
  initialSeconds?: number;
}) {
  const [display, setDisplay] = useState(
    initialSeconds ? formatCraftingTime(initialSeconds) : "",
  );
  const [error, setError] = useState(false);

  const seconds = parseCraftingTime(display);

  function handleChange(val: string) {
    setDisplay(val);
    if (val.trim() !== "") {
      const parsed = parseCraftingTime(val);
      setError(parsed === 0);
    } else {
      setError(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          id="craftingTimeDisplay"
          value={display}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={tLabels.craftingTimePlaceholder}
          className={`w-48 ${error ? "border-red-400" : ""}`}
          autoComplete="off"
        />
        {display && !error && (
          <span className="text-sm text-gray-500">= {seconds}s</span>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-500">{tLabels.craftingTimeInvalid}</p>
      )}
      <p className="text-xs text-gray-400">{tLabels.craftingTimeHint}</p>
      {/* Hidden field stores the value in seconds */}
      <input type="hidden" name="craftingTime" value={seconds || ""} />
    </div>
  );
}

/* ─────────────────────────────────────────
   Main export
───────────────────────────────────────── */
export function AdvancedBlueprintInputs({
  tLabels,
  initialTier,
  initialCraftingTime,
  initialStatistics,
  initialRecipe,
}: {
  tLabels: Record<string, string>;
  initialTier?: number;
  initialCraftingTime?: number;
  initialStatistics?: BlueprintStatistics;
  initialRecipe?: BlueprintRecipeStep[];
}) {
  return (
    <>
      {/* Tier */}
      <div className="space-y-1.5">
        <Label htmlFor="tier">{tLabels.fieldTier}</Label>
        <Input
          id="tier"
          name="tier"
          type="number"
          min={0}
          defaultValue={initialTier ?? 0}
          className="w-32"
        />
      </div>

      {/* Crafting time */}
      <div className="space-y-1.5">
        <Label htmlFor="craftingTimeDisplay">{tLabels.fieldCraftingTime}</Label>
        <CraftingTimeInput
          tLabels={tLabels}
          initialSeconds={initialCraftingTime}
        />
      </div>

      {/* Statistics */}
      <div className="space-y-1.5">
        <Label>{tLabels.fieldStatistics}</Label>
        <p className="text-xs text-gray-500">{tLabels.fieldStatisticsHint}</p>
        <StatisticsEditor tLabels={tLabels} initial={initialStatistics} />
      </div>

      {/* Recipe */}
      <div className="space-y-1.5">
        <Label>{tLabels.fieldRecipe}</Label>
        <p className="text-xs text-gray-500">{tLabels.fieldRecipeHint}</p>
        <RecipeEditor tLabels={tLabels} initial={initialRecipe} />
      </div>
    </>
  );
}
