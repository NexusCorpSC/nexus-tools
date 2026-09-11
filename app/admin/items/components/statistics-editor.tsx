"use client";

import { useTranslations } from "next-intl";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ItemStatistics } from "@/types/items";

export type StatRow = { name: string; value: string; unit: string };

export function statisticsToRows(statistics?: ItemStatistics): StatRow[] {
  return Object.entries(statistics ?? {}).map(([name, stat]) => ({
    name,
    value: String(stat.value),
    unit: stat.unit ?? "",
  }));
}

/**
 * Rows back to the stored shape. A numeric-looking value is kept as a number
 * so the detail page and any consumer can compare statistics.
 */
export function rowsToStatistics(rows: StatRow[]): ItemStatistics | undefined {
  const statistics: ItemStatistics = {};

  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name || !value) continue;

    statistics[name] = {
      value:
        value !== "" && !Number.isNaN(Number(value)) ? Number(value) : value,
      ...(row.unit.trim() ? { unit: row.unit.trim() } : {}),
    };
  }

  return Object.keys(statistics).length > 0 ? statistics : undefined;
}

export function StatisticsEditor({
  rows,
  onChange,
}: {
  rows: StatRow[];
  onChange: (rows: StatRow[]) => void;
}) {
  const t = useTranslations("Items.Admin");

  const update = (index: number, patch: Partial<StatRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      <Label>{t("fieldStatistics")}</Label>
      <p className="text-xs text-nexus">{t("fieldStatisticsHint")}</p>

      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap gap-2 items-center">
          <Input
            className="flex-1 min-w-40"
            value={row.name}
            placeholder={t("statName")}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <Input
            className="w-32"
            value={row.value}
            placeholder={t("statValue")}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <Input
            className="w-24"
            value={row.unit}
            placeholder={t("statUnit")}
            onChange={(event) => update(index, { unit: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("removeStat")}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <TrashIcon className="size-4 text-red-500" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { name: "", value: "", unit: "" }])}
      >
        <PlusIcon className="size-4" />
        {t("addStat")}
      </Button>
    </div>
  );
}
