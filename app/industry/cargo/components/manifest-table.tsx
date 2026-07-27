"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDownIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  BulkLineChanges,
  CargoLine,
  CONTAINER_SIZES,
  containerCount,
  EMPTY_FILTERS,
  filterLines,
  groupByDestination,
  groupByMission,
  hasMissions,
  ManifestFilters,
  SortDirection,
  SortKey,
  sortLines,
  sumQuantities,
  totalVolume,
} from "@/lib/cargo";
import BulkEditDialog from "./bulk-edit-dialog";
import ManifestFiltersBar from "./manifest-filters";

interface ManifestTableProps {
  lines: CargoLine[];
  onDeleteLine: (id: string) => void;
  onEditLine: (line: CargoLine) => void;
  onBulkEdit: (ids: string[], changes: BulkLineChanges) => void;
}

const numericCell = "px-2 py-2 text-right tabular-nums";

function distinct(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

interface SortableHeaderProps {
  sortBy: SortKey;
  label: string;
  align?: "left" | "right";
  sortKey: SortKey;
  sortDirection: SortDirection;
  onToggle: (key: SortKey) => void;
}

function SortableHeader({
  sortBy,
  label,
  align = "left",
  sortKey,
  sortDirection,
  onToggle,
}: SortableHeaderProps) {
  const isActive = sortKey === sortBy;
  const Icon = !isActive
    ? ChevronUpDownIcon
    : sortDirection === "asc"
      ? ChevronUpIcon
      : ChevronDownIcon;

  return (
    <th
      className={`px-3 py-2 text-xs font-semibold tracking-wide uppercase ${
        align === "right" ? "text-right" : "text-left"
      }`}
      aria-sort={
        isActive
          ? sortDirection === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => onToggle(sortBy)}
        className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-white ${
          isActive ? "text-white" : ""
        }`}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </th>
  );
}

export default function ManifestTable({
  lines,
  onDeleteLine,
  onEditLine,
  onBulkEdit,
}: ManifestTableProps) {
  const t = useTranslations("Cargo");
  const [filters, setFilters] = useState<ManifestFilters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("manifest");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const visibleLines = useMemo(
    () => filterLines(lines, filters),
    [lines, filters],
  );

  const missions = useMemo(
    () => distinct(lines.map((line) => line.mission)),
    [lines],
  );
  const destinationValues = useMemo(
    () => distinct(lines.map((line) => line.destination)),
    [lines],
  );
  const locationValues = useMemo(
    () => distinct(lines.map((line) => line.location)),
    [lines],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const sortProps = { sortKey, sortDirection, onToggle: toggleSort };

  const filtersBar = (
    <ManifestFiltersBar
      bulkEdit={
        <BulkEditDialog
          targetCount={visibleLines.length}
          onApply={(changes) =>
            onBulkEdit(
              visibleLines.map((line) => line.id),
              changes,
            )
          }
        />
      }
      filters={filters}
      missions={missions}
      destinations={destinationValues}
      locations={locationValues}
      matchCount={visibleLines.length}
      totalCount={lines.length}
      onChange={setFilters}
    />
  );

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-[#9ED0FF]/15 bg-[#0B3A5A]/40 py-10 text-center text-sm text-[#9ED0FF]/70">
        {t("emptyManifest")}
      </div>
    );
  }

  if (visibleLines.length === 0) {
    return (
      <div className="space-y-3">
        {filtersBar}
        <div className="rounded-lg border border-[#9ED0FF]/15 bg-[#0B3A5A]/40 py-10 text-center text-sm text-[#9ED0FF]/70">
          {t("noMatchingLine")}
        </div>
      </div>
    );
  }

  // Totals describe what the table shows, so they follow the filters.
  const totals = sumQuantities(visibleLines);
  const grandTotal = totalVolume(visibleLines);
  const destinations = groupByDestination(visibleLines);
  // Mission blocks only appear once at least one line carries a mission.
  const missionGroups = groupByMission(visibleLines).map((group) => ({
    ...group,
    lines: sortLines(group.lines, sortKey, sortDirection),
  }));
  const showMissions = hasMissions(visibleLines);

  return (
    <div className="space-y-3">
      {filtersBar}
      {/*
        contain-paint keeps the wide table's intrinsic width from leaking into
        the document scroll width on narrow screens (Chromium propagates table
        overflow past `overflow-x-auto` alone).
      */}
      <div className="contain-paint overflow-x-auto rounded-lg border border-[#9ED0FF]/15">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-nexus text-nexus-primary border-b border-[#9ED0FF]/20">
            <tr>
              <SortableHeader
                sortBy="destination"
                label={t("destination")}
                {...sortProps}
              />
              <SortableHeader
                sortBy="content"
                label={t("content")}
                {...sortProps}
              />
              <SortableHeader
                sortBy="location"
                label={t("location")}
                {...sortProps}
              />
              <SortableHeader
                sortBy="volume"
                label={t("volume")}
                align="right"
                {...sortProps}
              />
              {CONTAINER_SIZES.map((size) => (
                <th
                  key={size}
                  className="px-2 py-2 text-right text-xs font-semibold tracking-wide"
                >
                  {size}
                </th>
              ))}
              <SortableHeader
                sortBy="boxes"
                label={t("boxesShort")}
                align="right"
                {...sortProps}
              />
              <th className="px-2 py-2">
                <span className="sr-only">{t("actions")}</span>
              </th>
            </tr>
          </thead>

          {missionGroups.map((group) => (
            <tbody
              key={group.mission || "__unassigned__"}
              className="divide-y divide-[#9ED0FF]/10 border-t border-[#9ED0FF]/20"
            >
              {showMissions && (
                <tr className="bg-[#0B3A5A]/50">
                  <td
                    className="px-3 py-1.5 text-xs font-semibold tracking-wide uppercase"
                    colSpan={4 + CONTAINER_SIZES.length + 2}
                  >
                    {group.mission || t("noMission")}
                  </td>
                </tr>
              )}

              {group.lines.map((line, index) => {
                // Mirror the PowerShell tool: a thicker rule marks a change of
                // maximum container size mid-manifest.
                const startsNewBatch =
                  index > 0 &&
                  group.lines[index - 1].maxContainer !== line.maxContainer;

                return (
                  <tr
                    key={line.id}
                    className={
                      startsNewBatch ? "border-t-2 border-t-[#9ED0FF]/30" : ""
                    }
                  >
                    <td className="px-3 py-2 font-medium">
                      {line.destination}
                    </td>
                    <td className="px-3 py-2 text-[#C9E4FF]/80">
                      {line.content}
                    </td>
                    <td className="px-3 py-2 text-[#C9E4FF]/80">
                      {line.location}
                    </td>
                    <td className={`${numericCell} font-medium`}>
                      {line.volume}
                    </td>
                    {line.quantities.map((quantity, quantityIndex) => (
                      <td
                        key={CONTAINER_SIZES[quantityIndex]}
                        className={`${numericCell} ${
                          quantity === 0 ? "text-[#9ED0FF]/25" : ""
                        }`}
                      >
                        {quantity}
                      </td>
                    ))}
                    <td className={`${numericCell} text-[#9ED0FF]/70`}>
                      {containerCount(line.quantities)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("editLineFor", {
                          destination: line.destination,
                        })}
                        title={t("editLine")}
                        onClick={() => onEditLine(line)}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("deleteLine")}
                        title={t("deleteLine")}
                        onClick={() => onDeleteLine(line.id)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {showMissions && (
                <tr className="text-xs text-[#9ED0FF]/80">
                  <td className="px-3 py-1.5" colSpan={3}>
                    {t("totalForMission", {
                      mission: group.mission || t("noMission"),
                    })}
                  </td>
                  <td className={`${numericCell} py-1.5`}>{group.volume}</td>
                  {group.quantities.map((quantity, index) => (
                    <td
                      key={CONTAINER_SIZES[index]}
                      className={`${numericCell} py-1.5`}
                    >
                      {quantity}
                    </td>
                  ))}
                  <td className={`${numericCell} py-1.5`}>
                    {containerCount(group.quantities)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          ))}

          <tfoot className="border-t-2 border-[#9ED0FF]/30">
            <tr className="bg-[#0B3A5A]/60 font-semibold">
              <td className="px-3 py-2 uppercase" colSpan={3}>
                {t("total")}
              </td>
              <td className={numericCell}>{grandTotal}</td>
              {totals.map((quantity, index) => (
                <td key={CONTAINER_SIZES[index]} className={numericCell}>
                  {quantity}
                </td>
              ))}
              <td className={numericCell}>{containerCount(totals)}</td>
              <td />
            </tr>

            {destinations.length > 1 &&
              destinations.map((group) => (
                <tr
                  key={group.destination}
                  className="text-[#9ED0FF]/80 text-xs"
                >
                  <td className="px-3 py-1.5" colSpan={3}>
                    {t("totalFor", { destination: group.destination })}
                  </td>
                  <td className={`${numericCell} py-1.5`}>{group.volume}</td>
                  {group.quantities.map((quantity, index) => (
                    <td
                      key={CONTAINER_SIZES[index]}
                      className={`${numericCell} py-1.5`}
                    >
                      {quantity}
                    </td>
                  ))}
                  <td className={`${numericCell} py-1.5`}>
                    {containerCount(group.quantities)}
                  </td>
                  <td />
                </tr>
              ))}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
