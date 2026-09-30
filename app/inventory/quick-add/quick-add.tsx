"use client";

import {
  ClipboardEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowsPointingInIcon,
  CheckIcon,
  ExclamationCircleIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { InventoryItemWithLocation, Location } from "@/types/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, roundQty } from "@/lib/utils";
import { LocationCombobox } from "../components";
import { ItemNameCombobox } from "../item-name-combobox";
import { quickAddItems } from "../actions";
import type { QuickAddRow } from "@/lib/inventory-quick-add";

type Row = {
  key: number;
  name: string;
  quality: string;
  quantity: string;
  unit: string;
  /** Picked for this row; `null` falls back to the default place. */
  location: Location | null;
  /** A place named in a paste that matched none the reader can use. */
  locationText?: string;
  orgVisible: boolean;
};

type Status =
  | { kind: "empty" }
  | { kind: "error"; message: string; field?: "name" | "quality" | "quantity" | "location" }
  | { kind: "new"; row: QuickAddRow; message: string }
  | { kind: "merge"; row: QuickAddRow; from: number; to: number };

const CELL =
  "h-10 w-full rounded-none border-0 bg-transparent px-3 text-sm shadow-none dark:bg-transparent focus-visible:bg-[#0B3A5A] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9ED0FF]";

const KBD =
  "rounded bg-[#0B3A5A] px-1.5 py-0.5 font-mono text-[11px] text-[#C9E4FF]";

/**
 * A number as a French spreadsheet writes it too: "1 234,5", thousands split
 * by spaces (plain, non-breaking or narrow) and a decimal comma.
 */
function parseNumber(value: string) {
  return Number(value.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
}

function sameText(a: string | undefined, b: string | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/**
 * The quick-add table: several items typed one after another, or pasted from a
 * spreadsheet, and added in one go.
 *
 * Each row says, before anything is sent, what will become of it: a new item,
 * a new lot of something already held, or a top-up of an existing lot (same
 * name, quality, unit and note at the same place — the rule `quickAddItems`
 * applies).
 * Rows in error stay in the table after the others are added.
 */
export function QuickAddTable() {
  const t = useTranslations("Inventory");
  const locale = useLocale();
  const router = useRouter();

  const nextKey = useRef(0);
  const blankRow = useCallback(
    (orgVisible: boolean): Row => ({
      key: nextKey.current++,
      name: "",
      quality: "",
      quantity: "",
      unit: "",
      location: null,
      orgVisible,
    }),
    [],
  );

  const [defaultLocation, setDefaultLocation] = useState<Location | null>(null);
  const [defaultUnit, setDefaultUnit] = useState("");
  const [defaultQuality, setDefaultQuality] = useState("");
  const [defaultDescription, setDefaultDescription] = useState("");
  const [defaultOrg, setDefaultOrg] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => [
    blankRow(false),
    blankRow(false),
    blankRow(false),
  ]);
  const [existing, setExisting] = useState<InventoryItemWithLocation[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputs = useRef(new Map<number, HTMLInputElement>());
  const [focusKey, setFocusKey] = useState<number | null>(null);

  useEffect(() => {
    if (focusKey === null) return;
    nameInputs.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey, rows]);

  const fetchExisting = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/items");
      if (res.ok) setExisting(await res.json());
    } catch {
      // The table still works; it only cannot tell merges apart.
    }
  }, []);

  useEffect(() => {
    fetchExisting();
  }, [fetchExisting]);

  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }),
    [locale],
  );

  const knownNames = useMemo(
    () =>
      [...new Set(existing.map((item) => item.name))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [existing],
  );

  /** The unit the reader already counts a thing in, to fill a blank one. */
  const heldUnit = (name: string) =>
    existing.find((item) => item.unit && sameText(item.name, name))?.unit;

  const unitOf = (row: Row) =>
    row.unit.trim() || defaultUnit.trim() || heldUnit(row.name) || undefined;

  const statusOf = (row: Row): Status => {
    const blank =
      !row.name.trim() &&
      !row.quality.trim() &&
      !row.quantity.trim() &&
      !row.unit.trim() &&
      !row.location &&
      !row.locationText;
    if (blank) return { kind: "empty" };

    const name = row.name.trim();
    if (!name) return { kind: "error", message: t("quickAddErrorName"), field: "name" };

    // A blank quality takes the default one, if any.
    const qualityText = row.quality.trim() || defaultQuality.trim();
    let quality: number | undefined;
    if (qualityText) {
      if (!/^\d+$/.test(qualityText)) {
        return {
          kind: "error",
          message: row.quality.trim()
            ? t("quickAddErrorQuality")
            : t("quickAddErrorQualityDefault"),
          field: "quality",
        };
      }
      quality = parseInt(qualityText, 10);
    }

    const quantity = row.quantity.trim() ? parseNumber(row.quantity) : 1;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { kind: "error", message: t("quickAddErrorQuantity"), field: "quantity" };
    }

    if (!row.location && row.locationText) {
      return {
        kind: "error",
        message: t("quickAddErrorLocationUnknown", { name: row.locationText }),
        field: "location",
      };
    }
    const location = row.location ?? defaultLocation;
    if (!location) {
      return { kind: "error", message: t("quickAddErrorLocation"), field: "location" };
    }

    const unit = unitOf(row);
    const payload: QuickAddRow = {
      name,
      description: defaultDescription.trim() || undefined,
      quality,
      quantity,
      unit,
      locationId: location.id,
      orgVisible: row.orgVisible,
    };

    const match = existing.find(
      (item) =>
        item.location?.id === location.id &&
        sameText(item.name, name) &&
        sameText(item.unit, unit) &&
        sameText(item.description, payload.description) &&
        (item.quality ?? undefined) === quality,
    );
    if (match) {
      return {
        kind: "merge",
        row: payload,
        from: match.quantity,
        to: roundQty(match.quantity + quantity),
      };
    }

    const held = existing.some((item) => sameText(item.name, name));
    return {
      kind: "new",
      row: payload,
      message: held ? t("quickAddStatusNewLot") : t("quickAddStatusNewItem"),
    };
  };

  const statuses = rows.map(statusOf);
  const ready = statuses.flatMap((s) =>
    s.kind === "new" || s.kind === "merge" ? [s.row] : [],
  );
  const merges = statuses.filter((s) => s.kind === "merge").length;
  const errors = statuses.filter((s) => s.kind === "error").length;

  const update = (key: number, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const insertAfter = (key: number, added: Row[]) =>
    setRows((prev) => {
      const at = prev.findIndex((row) => row.key === key);
      return [...prev.slice(0, at + 1), ...added, ...prev.slice(at + 1)];
    });

  const addRow = () => {
    const row = blankRow(defaultOrg);
    setRows((prev) => [...prev, row]);
    setFocusKey(row.key);
  };

  const removeRow = (key: number) =>
    setRows((prev) => {
      const left = prev.filter((row) => row.key !== key);
      return left.length > 0 ? left : [blankRow(defaultOrg)];
    });

  const submit = async () => {
    if (ready.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await quickAddItems(ready);
      if (!result.ok) {
        setError(result.error || t("errorGeneric"));
        return;
      }

      toast.success(
        t("quickAddDone", { created: result.created, merged: result.merged }),
      );

      const kept = rows.filter((_, i) => statuses[i].kind === "error");
      if (kept.length === 0) {
        router.push("/inventory");
        return;
      }
      setRows(kept);
      fetchExisting();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRowKeyDown = (row: Row, index: number) => (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const next = rows[index + 1];
      if (next) {
        setFocusKey(next.key);
      } else {
        addRow();
      }
      return;
    }
    if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const copy = { ...row, key: nextKey.current++ };
      insertAfter(row.key, [copy]);
      setFocusKey(copy.key);
    }
  };

  /**
   * Resolves the place names a paste carried against the places the reader
   * can use, by exact name. One that matches none stays on its row as an
   * error, to be picked by hand.
   */
  const resolveLocations = async (pasted: Row[]) => {
    const names = [
      ...new Set(pasted.map((row) => row.locationText).filter(Boolean)),
    ] as string[];

    for (const name of names) {
      try {
        const res = await fetch(
          `/api/inventory/locations?query=${encodeURIComponent(name)}`,
        );
        if (!res.ok) continue;
        const found: Location[] = await res.json();
        const match = found.find((loc) => sameText(loc.name, name));
        if (!match) continue;
        setRows((prev) =>
          prev.map((row) =>
            row.locationText && sameText(row.locationText, name)
              ? { ...row, location: match, locationText: undefined }
              : row,
          ),
        );
      } catch {
        // Left as an error on the row.
      }
    }
  };

  /**
   * A paste of several cells or lines fills rows from this one down, in the
   * columns of the table: name, quality, quantity, unit, place. A first line
   * whose number columns hold words is taken for a header and skipped.
   */
  const handlePaste = (row: Row) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.trim().includes("\n")) return;
    e.preventDefault();

    let lines = text
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((cell) => cell.trim()))
      .filter((cells) => cells.some(Boolean));

    const looksNumeric = (cell?: string) =>
      !cell || Number.isFinite(parseNumber(cell));
    if (
      lines.length > 1 &&
      !(looksNumeric(lines[0][1]) && looksNumeric(lines[0][2]))
    ) {
      lines = lines.slice(1);
    }
    if (lines.length === 0) return;

    const pasted: Row[] = lines.map(([name = "", quality = "", quantity = "", unit = "", place = ""], i) => ({
      key: i === 0 ? row.key : nextKey.current++,
      name,
      quality,
      quantity,
      unit,
      location: null,
      locationText: place || undefined,
      orgVisible: row.orgVisible,
    }));

    setRows((prev) => {
      const at = prev.findIndex((r) => r.key === row.key);
      // Blank rows right after this one are filled rather than pushed down.
      let end = at + 1;
      while (
        end < prev.length &&
        end - at < pasted.length &&
        statusOf(prev[end]).kind === "empty"
      ) {
        end++;
      }
      return [...prev.slice(0, at), ...pasted, ...prev.slice(end)];
    });
    resolveLocations(pasted);
  };

  const defaultQualityValid =
    !defaultQuality.trim() || /^\d+$/.test(defaultQuality.trim());

  const defaultLocationLabel = defaultLocation
    ? t("quickAddLocationDefault", { name: defaultLocation.name })
    : t("fieldLocationPlaceholder");

  return (
    <div className="space-y-4">
      {/* Defaults */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-[#9ED0FF]/14 bg-[#0A2A42] px-4 py-3">
        <span className="text-xs font-semibold tracking-wider text-[#7E9FB7] uppercase">
          {t("quickAddDefaults")}
        </span>
        <div className="flex items-center gap-2 text-sm text-[#7E9FB7]">
          <span id="quick-add-default-location">{t("fieldLocation")}</span>
          <div className="w-64">
            <LocationCombobox
              value={defaultLocation}
              onChange={setDefaultLocation}
              placeholder={t("fieldLocationPlaceholder")}
              aria-label={t("fieldLocation")}
              inputClassName="h-8 bg-[#092F49]"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#7E9FB7]">
          {t("fieldQuality")}
          <Input
            inputMode="numeric"
            value={defaultQuality}
            onChange={(e) => setDefaultQuality(e.target.value)}
            placeholder="—"
            aria-invalid={!defaultQualityValid || undefined}
            className="h-8 w-20 bg-[#092F49] text-right font-mono"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[#7E9FB7]">
          {t("fieldUnit")}
          <Input
            value={defaultUnit}
            onChange={(e) => setDefaultUnit(e.target.value)}
            placeholder={t("fieldUnitPlaceholder")}
            className="h-8 w-28 bg-[#092F49]"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[#7E9FB7]">
          {t("fieldDescription")}
          <Input
            value={defaultDescription}
            onChange={(e) => setDefaultDescription(e.target.value)}
            placeholder={t("fieldDescriptionPlaceholder")}
            className="h-8 w-72 bg-[#092F49]"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#C9E4FF]">
          <input
            type="checkbox"
            checked={defaultOrg}
            onChange={(e) => {
              const next = e.target.checked;
              setDefaultOrg(next);
              setRows((prev) => prev.map((row) => ({ ...row, orgVisible: next })));
            }}
            className="size-3.5 accent-[#9ED0FF]"
          />
          {t("orgVisibleShort")}
        </label>
        <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#7E9FB7]">
          <span>
            <kbd className={KBD}>Tab</kbd> {t("quickAddHintTab")}
          </span>
          <span>
            <kbd className={KBD}>↵</kbd> {t("quickAddHintEnter")}
          </span>
          <span>
            <kbd className={KBD}>Ctrl D</kbd> {t("quickAddHintDuplicate")}
          </span>
          <span>
            <kbd className={KBD}>Ctrl V</kbd> {t("quickAddHintPaste")}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#9ED0FF]/18 bg-[#0A2A42] lg:overflow-visible">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#9ED0FF]/18 bg-[#092F49] text-left text-xs font-semibold tracking-wide text-[#7E9FB7] uppercase">
              <th scope="col" className="w-10 py-2.5 text-center font-semibold">
                #
              </th>
              <th scope="col" className="px-3 font-semibold">
                {t("fieldName")}
              </th>
              <th scope="col" className="w-24 px-3 text-right font-semibold">
                {t("fieldQuality")}
              </th>
              <th scope="col" className="w-28 px-3 text-right font-semibold">
                {t("fieldQuantity")}
              </th>
              <th scope="col" className="w-24 px-3 font-semibold">
                {t("fieldUnit")}
              </th>
              <th scope="col" className="w-64 px-3 font-semibold">
                {t("quickAddColumnLocation")}
              </th>
              <th scope="col" className="w-14 text-center font-semibold">
                {t("quickAddColumnOrg")}
              </th>
              <th scope="col" className="w-56 px-3 font-semibold">
                {t("quickAddColumnStatus")}
              </th>
              <th scope="col" className="w-10">
                <span className="sr-only">{t("quickAddRemoveRow")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const status = statuses[index];
              const errorField = status.kind === "error" ? status.field : undefined;
              return (
                <tr
                  key={row.key}
                  onKeyDown={handleRowKeyDown(row, index)}
                  className={cn(
                    "border-b border-[#9ED0FF]/10 [&>td+td]:border-l [&>td+td]:border-[#9ED0FF]/10",
                    status.kind === "error" && "bg-red-400/5",
                  )}
                >
                  <td className="text-center font-mono text-xs text-[#4F7390]">
                    {index + 1}
                  </td>
                  <td>
                    <ItemNameCombobox
                      inputRef={(el) => {
                        if (el) nameInputs.current.set(row.key, el);
                        else nameInputs.current.delete(row.key);
                      }}
                      autoFocus={index === 0}
                      value={row.name}
                      held={knownNames}
                      onChange={(name) => update(row.key, { name })}
                      onPaste={handlePaste(row)}
                      placeholder={t("fieldNamePlaceholder")}
                      aria-label={t("fieldName")}
                      invalid={errorField === "name"}
                      className={CELL}
                    />
                  </td>
                  <td>
                    <Input
                      inputMode="numeric"
                      value={row.quality}
                      onChange={(e) => update(row.key, { quality: e.target.value })}
                      placeholder={defaultQuality.trim() || "—"}
                      aria-label={t("fieldQuality")}
                      aria-invalid={errorField === "quality" || undefined}
                      className={cn(
                        CELL,
                        "text-right font-mono",
                        errorField === "quality" && "bg-red-400/10 text-red-300",
                      )}
                    />
                  </td>
                  <td>
                    <Input
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => update(row.key, { quantity: e.target.value })}
                      placeholder="1"
                      aria-label={t("fieldQuantity")}
                      aria-invalid={errorField === "quantity" || undefined}
                      className={cn(
                        CELL,
                        "text-right font-mono",
                        errorField === "quantity" && "bg-red-400/10 text-red-300",
                      )}
                    />
                  </td>
                  <td>
                    <Input
                      value={row.unit}
                      onChange={(e) => update(row.key, { unit: e.target.value })}
                      placeholder={unitOf({ ...row, unit: "" }) ?? "—"}
                      aria-label={t("fieldUnit")}
                      className={CELL}
                    />
                  </td>
                  <td>
                    <LocationCombobox
                      value={row.location}
                      onChange={(location) =>
                        update(row.key, { location, locationText: undefined })
                      }
                      placeholder={row.locationText ?? defaultLocationLabel}
                      aria-label={t("quickAddColumnLocation")}
                      inputClassName={cn(
                        CELL,
                        errorField === "location" && "placeholder:text-red-300",
                      )}
                    />
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={row.orgVisible}
                      onChange={(e) =>
                        update(row.key, { orgVisible: e.target.checked })
                      }
                      aria-label={t("orgVisibleShort")}
                      className="size-3.5 accent-[#9ED0FF]"
                    />
                  </td>
                  <td className="px-3 text-xs">
                    <RowStatus status={status} format={number.format} />
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      aria-label={t("quickAddRemoveRow")}
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
        <button
          type="button"
          onClick={addRow}
          className="flex h-11 w-full items-center gap-2 px-4 text-sm text-[#7E9FB7] hover:bg-[#9ED0FF]/5 hover:text-[#CCE7FF]"
        >
          <PlusIcon className="size-4" />
          {t("quickAddAddRow")}
        </button>
      </div>

      {/* Summary */}
      <div className="sticky bottom-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-[#9ED0FF]/20 bg-[#092F49] px-4 py-3 shadow-lg shadow-black/30">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            <strong className="text-emerald-300">{ready.length}</strong>{" "}
            {t("quickAddSummaryReady", { count: ready.length })}
          </span>
          <span>
            <strong className="text-amber-300">{merges}</strong>{" "}
            {t("quickAddSummaryMerges", { count: merges })}
          </span>
          <span>
            <strong className="text-red-300">{errors}</strong>{" "}
            {t("quickAddSummaryErrors", { count: errors })}
          </span>
        </div>
        <p className="flex-1 text-xs text-[#7E9FB7]">
          {error ? (
            <span className="text-red-300">{error}</span>
          ) : errors > 0 ? (
            t("quickAddErrorsKept")
          ) : null}
        </p>
        <Button asChild variant="outline" className="border-[#9ED0FF]/35 bg-transparent">
          <Link href="/inventory">{t("cancel")}</Link>
        </Button>
        <Button onClick={submit} disabled={ready.length === 0 || submitting}>
          {submitting ? t("saving") : t("quickAddSubmit", { count: ready.length })}
          <kbd className="rounded bg-[#061E30]/15 px-1.5 py-0.5 font-mono text-[11px]">
            Ctrl ↵
          </kbd>
        </Button>
      </div>
    </div>
  );
}

function RowStatus({
  status,
  format,
}: {
  status: Status;
  format: (n: number) => string;
}) {
  const t = useTranslations("Inventory");

  switch (status.kind) {
    case "empty":
      return null;
    case "error":
      return (
        <span className="flex items-center gap-1.5 text-red-300">
          <ExclamationCircleIcon className="size-4 shrink-0" />
          <span className="truncate">{status.message}</span>
        </span>
      );
    case "merge":
      return (
        <span className="flex items-center gap-1.5 text-amber-300">
          <ArrowsPointingInIcon className="size-4 shrink-0" />
          <span className="truncate">
            {t("quickAddStatusMerge", {
              from: format(status.from),
              to: format(status.to),
            })}
          </span>
        </span>
      );
    case "new":
      return (
        <span className="flex items-center gap-1.5 text-[#7E9FB7]">
          <CheckIcon className="size-4 shrink-0 text-emerald-300" />
          <span className="truncate">{status.message}</span>
        </span>
      );
  }
}
