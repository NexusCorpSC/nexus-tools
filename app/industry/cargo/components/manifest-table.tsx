"use client";

import { useTranslations } from "next-intl";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  CargoLine,
  CONTAINER_SIZES,
  containerCount,
  groupByDestination,
  sumQuantities,
  totalVolume,
} from "@/lib/cargo";

interface ManifestTableProps {
  lines: CargoLine[];
  onDeleteLine: (id: string) => void;
}

const numericCell = "px-2 py-2 text-right tabular-nums";

export default function ManifestTable({
  lines,
  onDeleteLine,
}: ManifestTableProps) {
  const t = useTranslations("Cargo");

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-[#9ED0FF]/15 bg-[#0B3A5A]/40 py-10 text-center text-sm text-[#9ED0FF]/70">
        {t("emptyManifest")}
      </div>
    );
  }

  const totals = sumQuantities(lines);
  const grandTotal = totalVolume(lines);
  const destinations = groupByDestination(lines);

  return (
    // contain-paint keeps the wide table's intrinsic width from leaking into
    // the document scroll width on narrow screens (Chromium propagates table
    // overflow past `overflow-x-auto` alone).
    <div className="contain-paint overflow-x-auto rounded-lg border border-[#9ED0FF]/15">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-nexus text-nexus-primary border-b border-[#9ED0FF]/20">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase">
              {t("destination")}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase">
              {t("content")}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase">
              {t("location")}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold tracking-wide uppercase">
              {t("volume")}
            </th>
            {CONTAINER_SIZES.map((size) => (
              <th
                key={size}
                className="px-2 py-2 text-right text-xs font-semibold tracking-wide"
              >
                {size}
              </th>
            ))}
            <th className="px-2 py-2 text-right text-xs font-semibold tracking-wide uppercase">
              {t("boxesShort")}
            </th>
            <th className="px-2 py-2">
              <span className="sr-only">{t("actions")}</span>
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#9ED0FF]/10">
          {lines.map((line, index) => {
            // Mirror the PowerShell tool: a thicker rule marks a change of
            // maximum container size mid-manifest.
            const startsNewBatch =
              index > 0 && lines[index - 1].maxContainer !== line.maxContainer;

            return (
              <tr
                key={line.id}
                className={
                  startsNewBatch ? "border-t-2 border-t-[#9ED0FF]/30" : ""
                }
              >
                <td className="px-3 py-2 font-medium">{line.destination}</td>
                <td className="px-3 py-2 text-[#C9E4FF]/80">{line.content}</td>
                <td className="px-3 py-2 text-[#C9E4FF]/80">{line.location}</td>
                <td className={`${numericCell} font-medium`}>{line.volume}</td>
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
                <td className="px-2 py-2 text-right">
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
        </tbody>

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
              <tr key={group.destination} className="text-[#9ED0FF]/80 text-xs">
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
  );
}
