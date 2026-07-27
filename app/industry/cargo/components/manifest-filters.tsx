"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  ManifestFilters,
  UNASSIGNED_FILTER,
} from "@/lib/cargo";

/** Radix selects cannot hold an empty value, so "all" stands in for it. */
const ALL = "__all__";

interface ManifestFiltersProps {
  /** Bulk edit trigger, rendered here because it acts on the visible lines. */
  bulkEdit: React.ReactNode;
  filters: ManifestFilters;
  missions: string[];
  destinations: string[];
  locations: string[];
  matchCount: number;
  totalCount: number;
  onChange: (filters: ManifestFilters) => void;
}

export default function ManifestFiltersBar({
  bulkEdit,
  filters,
  missions,
  destinations,
  locations,
  matchCount,
  totalCount,
  onChange,
}: ManifestFiltersProps) {
  const t = useTranslations("Cargo");
  const isFiltered = hasActiveFilters(filters);

  const facets = [
    {
      key: "mission" as const,
      label: t("mission"),
      values: missions,
      allLabel: t("allMissions"),
      emptyLabel: t("noMission"),
    },
    {
      key: "destination" as const,
      label: t("destination"),
      values: destinations,
      allLabel: t("allDestinations"),
      emptyLabel: t("unassignedValue"),
    },
    {
      key: "location" as const,
      label: t("location"),
      values: locations,
      allLabel: t("allLocations"),
      emptyLabel: t("unassignedValue"),
    },
  ];

  return (
    <div className="space-y-2 rounded-lg border border-[#9ED0FF]/15 bg-[#0B3A5A]/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="cargo-search">{t("search")}</Label>
          <Input
            id="cargo-search"
            type="search"
            value={filters.search}
            onChange={(event) =>
              onChange({ ...filters, search: event.target.value })
            }
            placeholder={t("searchPlaceholder")}
          />
        </div>

        {facets.map((facet) => (
          <div key={facet.key} className="space-y-1">
            <Label htmlFor={`cargo-filter-${facet.key}`}>{facet.label}</Label>
            <Select
              value={filters[facet.key] || ALL}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  [facet.key]: value === ALL ? "" : value,
                })
              }
            >
              <SelectTrigger id={`cargo-filter-${facet.key}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{facet.allLabel}</SelectItem>
                {facet.values.map((value) => (
                  // Radix rejects an empty item value, hence the marker.
                  <SelectItem
                    key={value || UNASSIGNED_FILTER}
                    value={value || UNASSIGNED_FILTER}
                  >
                    {value || facet.emptyLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9ED0FF]/70">
        <span>
          {isFiltered
            ? t("filteredCount", { matchCount, totalCount })
            : t("lineCount", { count: totalCount })}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {isFiltered && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onChange(EMPTY_FILTERS)}
            >
              {t("clearFilters")}
            </Button>
          )}
          {bulkEdit}
        </div>
      </div>
    </div>
  );
}
