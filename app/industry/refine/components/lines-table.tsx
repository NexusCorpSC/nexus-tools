"use client";

import { useTranslations } from "next-intl";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { REFINED_MATERIALS } from "@/lib/refinery-work-order";
import type { RefiningLine } from "@/lib/refining";

/** Une ligne en cours de saisie : les nombres restent du texte jusqu'au contrôle. */
export type LineDraft = {
  key: number;
  name: string;
  quality: string;
  /** En cSCU. */
  quantity: string;
  /** À la collecte : la ligne part dans l'inventaire. */
  take?: boolean;
  /** Le texte lu par l'OCR, montré au survol. */
  raw?: string;
};

type Checked =
  | { ok: true; line: RefiningLine }
  | { ok: false; field: "name" | "quality" | "quantity" };

let nextKey = 0;

export function draftKey() {
  return nextKey++;
}

export function toDraft(line: Partial<RefiningLine>, take = true): LineDraft {
  return {
    key: draftKey(),
    name: line.name ?? "",
    quality: line.quality?.toString() ?? "",
    quantity: line.quantity?.toString() ?? "",
    take,
  };
}

/** Une ligne laissée vide : ni comptée, ni signalée. */
export function isBlank(row: LineDraft) {
  return !row.name.trim() && !row.quality.trim() && !row.quantity.trim();
}

/** Le contrôle d'une ligne : le même que le serveur (`checkLines`). */
export function checkDraft(row: LineDraft): Checked {
  const name = row.name.trim();
  if (!name) return { ok: false, field: "name" };

  let quality: number | undefined;
  const rawQuality = row.quality.trim();
  if (rawQuality) {
    if (!/^\d+$/.test(rawQuality)) return { ok: false, field: "quality" };
    quality = parseInt(rawQuality, 10);
    if (quality > 1000) return { ok: false, field: "quality" };
  }

  const rawQuantity = row.quantity.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(rawQuantity)) return { ok: false, field: "quantity" };
  const quantity = Number(rawQuantity);
  if (quantity <= 0) return { ok: false, field: "quantity" };

  return { ok: true, line: { name, quality, quantity } };
}

/**
 * Le tableau des matériaux d'un ordre : nom (avec les matériaux raffinés
 * connus en suggestion), qualité sur 1000, quantité en cSCU. À la collecte,
 * une case par ligne choisit ce qui part dans l'inventaire et une colonne dit
 * ce que la ligne y deviendra.
 */
export function LinesTable({
  rows,
  onChange,
  selectable = false,
  outcome,
  unitLabel = "cSCU",
}: {
  rows: LineDraft[];
  onChange: (rows: LineDraft[]) => void;
  selectable?: boolean;
  /** À la collecte : ce que deviendra chaque ligne cochée dans l'inventaire. */
  outcome?: (row: LineDraft) => React.ReactNode;
  unitLabel?: string;
}) {
  const t = useTranslations("Refining");
  const checked = rows.map(checkDraft);

  const update = (key: number, patch: Partial<LineDraft>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const cell =
    "h-9 w-full rounded-none border-0 bg-transparent px-3 text-sm shadow-none dark:bg-transparent focus-visible:bg-[#0B3A5A] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9ED0FF]";
  const allTaken = rows.length > 0 && rows.every((row) => row.take);

  return (
    <div className="overflow-x-auto rounded-lg border border-[#9ED0FF]/18 bg-[#0A2A42]">
      <table className="w-full min-w-[26rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#9ED0FF]/18 bg-[#092F49] text-left text-xs font-semibold tracking-wide text-[#7E9FB7] uppercase">
            {selectable && (
              <th scope="col" className="w-9 px-3">
                <input
                  type="checkbox"
                  checked={allTaken}
                  onChange={(event) =>
                    onChange(
                      rows.map((row) => ({ ...row, take: event.target.checked })),
                    )
                  }
                  aria-label={t("collectTakeAll")}
                  className="size-3.5 accent-[#9ED0FF]"
                />
              </th>
            )}
            <th scope="col" className="px-3 py-2 font-semibold">
              {t("material")}
            </th>
            <th scope="col" className="w-24 px-3 text-right font-semibold">
              {t("quality")}
            </th>
            <th scope="col" className="w-28 px-3 text-right font-semibold">
              {unitLabel}
            </th>
            {outcome && (
              <th scope="col" className="px-3 font-semibold">
                {t("collectOutcome")}
              </th>
            )}
            <th scope="col" className="w-9">
              <span className="sr-only">{t("removeLine")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const result = checked[index];
            const field = result.ok || isBlank(row) ? undefined : result.field;
            const inactive = selectable && !row.take;
            return (
              <tr
                key={row.key}
                className={cn(
                  "border-b border-[#9ED0FF]/10 [&>td+td]:border-l [&>td+td]:border-[#9ED0FF]/10",
                  field && !inactive && "bg-red-400/5",
                  inactive && "opacity-55",
                )}
              >
                {selectable && (
                  <td className="px-3">
                    <input
                      type="checkbox"
                      checked={row.take ?? false}
                      onChange={(event) =>
                        update(row.key, { take: event.target.checked })
                      }
                      aria-label={t("collectTake", { name: row.name })}
                      className="size-3.5 accent-[#9ED0FF]"
                    />
                  </td>
                )}
                <td>
                  <Input
                    value={row.name}
                    list="refined-materials"
                    onChange={(event) =>
                      update(row.key, { name: event.target.value })
                    }
                    placeholder="Taranite"
                    aria-label={t("material")}
                    title={row.raw}
                    aria-invalid={field === "name" || undefined}
                    className={cell}
                  />
                </td>
                <td>
                  <Input
                    inputMode="numeric"
                    value={row.quality}
                    onChange={(event) =>
                      update(row.key, { quality: event.target.value })
                    }
                    placeholder="—"
                    aria-label={t("quality")}
                    title={row.raw}
                    aria-invalid={field === "quality" || undefined}
                    className={cn(
                      cell,
                      "text-right font-mono",
                      field === "quality" && "bg-red-400/10 text-red-300",
                    )}
                  />
                </td>
                <td>
                  <Input
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(event) =>
                      update(row.key, { quantity: event.target.value })
                    }
                    placeholder="?"
                    aria-label={t("quantityCscu")}
                    title={row.raw}
                    aria-invalid={field === "quantity" || undefined}
                    className={cn(
                      cell,
                      "text-right font-mono",
                      field === "quantity" &&
                        "bg-red-400/10 text-red-300 placeholder:text-red-300",
                    )}
                  />
                </td>
                {outcome && (
                  <td className="px-3 text-xs whitespace-nowrap">
                    {outcome(row)}
                  </td>
                )}
                <td className="text-center">
                  <button
                    type="button"
                    onClick={() =>
                      onChange(rows.filter((other) => other.key !== row.key))
                    }
                    aria-label={t("removeLine")}
                    className="inline-flex size-8 items-center justify-center rounded-md text-[#7E9FB7] hover:bg-red-400/10 hover:text-red-300"
                  >
                    <XMarkIcon className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="refined-materials">
        {REFINED_MATERIALS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={() => onChange([...rows, toDraft({})])}
        className="flex h-10 w-full items-center gap-2 px-3 text-sm text-[#7E9FB7] hover:bg-[#9ED0FF]/5 hover:text-[#CCE7FF]"
      >
        <PlusIcon className="size-4" />
        {t("addLine")}
      </button>
    </div>
  );
}
