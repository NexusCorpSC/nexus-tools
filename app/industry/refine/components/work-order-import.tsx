"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ExclamationTriangleIcon,
  PhotoIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn, roundQty } from "@/lib/utils";
import { Location } from "@/types/inventory";
import type { QuickAddRow } from "@/lib/inventory-quick-add";
import {
  parseWorkOrderText,
  REFINED_MATERIALS,
} from "@/lib/refinery-work-order";
import { LocationCombobox } from "@/app/inventory/components";
import { quickAddItems } from "@/app/inventory/actions";

type Status = "idle" | "reading" | "done" | "error";

/** How the lots are counted in the inventory: as the panel gives them, or in SCU. */
type Unit = "cSCU" | "SCU";

type Row = {
  key: number;
  name: string;
  quality: string;
  /** In cSCU, as the panel gives it. */
  quantity: string;
  /** The line as OCR read it, shown when the row needs checking. */
  raw?: string;
};

type Checked =
  | { ok: true; row: Omit<QuickAddRow, "locationId" | "orgVisible" | "unit"> }
  | { ok: false; field?: "name" | "quality" | "quantity" };

/** Beyond this many pixels the upscaled capture only slows OCR down. */
const MAX_OCR_PIXELS = 16_000_000;

/**
 * The capture as OCR reads it best: the in-game font is small and light on a
 * dark panel, so it is enlarged up to three times, flattened on black (a PNG
 * may be transparent), turned grey and inverted into dark text on white.
 */
async function prepareCapture(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(
    1,
    Math.min(3, Math.sqrt(MAX_OCR_PIXELS / (bitmap.width * bitmap.height))),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D is not available");
  }

  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const grey =
      0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const inverted = 255 - grey;
    pixels[i] = inverted;
    pixels[i + 1] = inverted;
    pixels[i + 2] = inverted;
  }
  context.putImageData(image, 0, 0);

  return canvas;
}

/**
 * A completed refinery work order, read from a screenshot of its panel and
 * added to the inventory at the place picked.
 *
 * OCR is never trusted blindly: every line lands in a table to check against
 * the capture shown beside it — the game's zero, barred with a dot, is easily
 * read as an 8 — and the panel's own total is set against the lines' sum.
 * The lots then go through the inventory's quick add, so a lot already held
 * at that place, same material and quality, is topped up rather than split.
 */
export default function WorkOrderImport({
  locationHint,
  trigger,
}: {
  /** The refinery the order ran at, to preselect when it is a known place. */
  locationHint?: string;
  /** Replaces the default button that opens the dialog. */
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("Refining");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | undefined>();
  const [location, setLocation] = useState<Location | null>(null);
  const [unit, setUnit] = useState<Unit>("cSCU");
  const [orgVisible, setOrgVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  // Bumped on every read and on every reset: an OCR run that finishes after
  // the dialog was closed, or after another capture was dropped in, must not
  // resurrect its results.
  const runRef = useRef(0);

  function reset() {
    runRef.current += 1;
    setStatus("idle");
    setProgress(0);
    setError(null);
    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setRows([]);
    setTotal(undefined);
    setSubmitError(null);
  }

  // The refinery the job ran at, when the reader's places know it by name.
  useEffect(() => {
    const hint = locationHint?.trim();
    if (!open || !hint || location) {
      return;
    }

    let cancelled = false;
    fetch(`/api/inventory/locations?query=${encodeURIComponent(hint)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((found: Location[]) => {
        const match = found.find(
          (place) => place.name.trim().toLowerCase() === hint.toLowerCase(),
        );
        if (match && !cancelled) {
          setLocation((current) => current ?? match);
        }
      })
      .catch(() => {
        // Picked by hand then.
      });

    return () => {
      cancelled = true;
    };
  }, [open, locationHint, location]);

  const readImage = useCallback(async (file: File) => {
    const run = (runRef.current += 1);
    const isCurrent = () => runRef.current === run;

    setStatus("reading");
    setProgress(0);
    setError(null);
    setRows([]);
    setTotal(undefined);
    setSubmitError(null);
    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });

    try {
      const capture = await prepareCapture(file);

      // Loaded on demand: the OCR engine is far too heavy for the page bundle.
      const { createWorker, PSM } = await import("tesseract.js");

      const worker = await createWorker("eng", 1, {
        logger: (message: { status: string; progress: number }) => {
          if (message.status === "recognizing text" && isCurrent()) {
            setProgress(Math.round(message.progress * 100));
          }
        },
      });

      try {
        // One uniform block: the panel is a plain table, and the automatic
        // layout splits its columns apart.
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        });
        const { data } = await worker.recognize(capture);

        if (!isCurrent()) {
          return;
        }

        const parsed = parseWorkOrderText(data.text);
        setRows(
          parsed.lines.map((line) => ({
            key: nextKey.current++,
            name: line.name,
            quality: line.quality?.toString() ?? "",
            quantity: line.quantity?.toString() ?? "",
            raw: line.raw,
          })),
        );
        setTotal(parsed.total);
        setStatus("done");
      } finally {
        await worker.terminate();
      }
    } catch (cause) {
      console.error(cause);

      if (!isCurrent()) {
        return;
      }

      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, []);

  // Ctrl+V of a screenshot, which is how the game capture usually arrives.
  useEffect(() => {
    if (!open) {
      return;
    }

    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items ?? [])]
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .find((item): item is File => item !== null);

      if (file) {
        event.preventDefault();
        void readImage(file);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, readImage]);

  const check = (row: Row): Checked => {
    const name = row.name.trim();
    if (!name) return { ok: false, field: "name" };

    let quality: number | undefined;
    if (row.quality.trim()) {
      if (!/^\d+$/.test(row.quality.trim()))
        return { ok: false, field: "quality" };
      quality = parseInt(row.quality.trim(), 10);
      if (quality > 1000) return { ok: false, field: "quality" };
    }

    if (!/^\d+$/.test(row.quantity.trim()))
      return { ok: false, field: "quantity" };
    const quantity = parseInt(row.quantity.trim(), 10);
    if (quantity <= 0) return { ok: false, field: "quantity" };

    return { ok: true, row: { name, quality, quantity } };
  };

  const checked = rows.map(check);
  const valid = checked.flatMap((c) => (c.ok ? [c.row] : []));
  const invalid = checked.length - valid.length;
  const sum = valid.reduce((acc, row) => acc + row.quantity, 0);
  const number = new Intl.NumberFormat(locale);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const submit = async () => {
    if (!location || valid.length === 0 || invalid > 0 || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await quickAddItems(
        valid.map((row) => ({
          ...row,
          quantity:
            unit === "SCU" ? roundQty(row.quantity / 100) : row.quantity,
          unit,
          locationId: location.id,
          orgVisible,
        })),
      );
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }

      toast.success(t("workOrderDone", { name: location.name }), {
        description: t("workOrderDoneDescription", {
          created: result.created,
          merged: result.merged,
        }),
        action: {
          label: t("workOrderSeeInventory"),
          onClick: () => window.location.assign("/inventory"),
        },
      });
      setOpen(false);
      reset();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline">
            <PhotoIcon className="h-4 w-4" />
            {t("workOrderImport")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("workOrderImport")}</DialogTitle>
          <DialogDescription>
            {t("workOrderImportDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Destination: first, so its suggestions have room to open. */}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-[#9ED0FF]/14 bg-[#0A2A42] px-4 py-3">
            <div className="min-w-64 flex-1 space-y-1">
              <span className="text-xs font-semibold tracking-wider text-[#7E9FB7] uppercase">
                {t("workOrderLocation")}
              </span>
              <LocationCombobox
                value={location}
                onChange={setLocation}
                placeholder={locationHint || t("workOrderLocationPlaceholder")}
                aria-label={t("workOrderLocation")}
                inputClassName="h-9 bg-[#092F49]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold tracking-wider text-[#7E9FB7] uppercase">
                {t("workOrderUnit")}
              </span>
              <div className="flex h-9 overflow-hidden rounded-md border border-[#9ED0FF]/25">
                {(["cSCU", "SCU"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setUnit(option)}
                    aria-pressed={unit === option}
                    className={cn(
                      "px-3 text-sm",
                      unit === option
                        ? "bg-[#9ED0FF]/20 text-[#E6F3FF]"
                        : "text-[#7E9FB7] hover:bg-[#9ED0FF]/10",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-[#C9E4FF]">
              <input
                type="checkbox"
                checked={orgVisible}
                onChange={(event) => setOrgVisible(event.target.checked)}
                className="size-3.5 accent-[#9ED0FF]"
              />
              {t("workOrderOrgVisible")}
            </label>
          </div>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file?.type.startsWith("image/")) {
                void readImage(file);
              }
            }}
            className="rounded-lg border border-dashed border-[#9ED0FF]/30 bg-[#0B3A5A]/40 p-4 text-center"
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void readImage(file);
                }
                event.target.value = "";
              }}
            />

            <p className="text-sm text-[#9ED0FF]/80">{t("workOrderDrop")}</p>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => inputRef.current?.click()}
              disabled={status === "reading"}
            >
              {t("workOrderChoose")}
            </Button>
          </div>

          {status === "reading" && (
            <p className="text-sm text-[#9ED0FF]/80">
              {t("workOrderReading", { progress })}
            </p>
          )}

          {status === "error" && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {t("workOrderError")}
              {error ? ` (${error})` : ""}
            </p>
          )}

          {(preview || status === "done") && (
            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element -- local blob
                <img
                  src={preview}
                  alt=""
                  className="max-h-[28rem] w-full rounded-md object-contain object-top"
                />
              )}

              {status === "done" && (
                <div className="space-y-2">
                  <p className="text-xs text-[#7E9FB7]">
                    {t("workOrderCheckHint")}
                  </p>

                  <div className="overflow-hidden rounded-lg border border-[#9ED0FF]/18 bg-[#0A2A42]">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[#9ED0FF]/18 bg-[#092F49] text-left text-xs font-semibold tracking-wide text-[#7E9FB7] uppercase">
                          <th scope="col" className="px-3 py-2 font-semibold">
                            {t("workOrderMaterial")}
                          </th>
                          <th
                            scope="col"
                            className="w-20 px-3 text-right font-semibold"
                          >
                            {t("workOrderQuality")}
                          </th>
                          <th
                            scope="col"
                            className="w-24 px-3 text-right font-semibold"
                          >
                            {t("workOrderYield")}
                          </th>
                          <th scope="col" className="w-9">
                            <span className="sr-only">
                              {t("workOrderRemoveRow")}
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => {
                          const result = checked[index];
                          const field = result.ok ? undefined : result.field;
                          const cell =
                            "h-9 w-full rounded-none border-0 bg-transparent px-3 text-sm shadow-none dark:bg-transparent focus-visible:bg-[#0B3A5A] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9ED0FF]";
                          return (
                            <tr
                              key={row.key}
                              className={cn(
                                "border-b border-[#9ED0FF]/10 [&>td+td]:border-l [&>td+td]:border-[#9ED0FF]/10",
                                !result.ok && "bg-red-400/5",
                              )}
                            >
                              <td>
                                <Input
                                  value={row.name}
                                  list="work-order-materials"
                                  onChange={(event) =>
                                    update(row.key, {
                                      name: event.target.value,
                                    })
                                  }
                                  aria-label={t("workOrderMaterial")}
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
                                    update(row.key, {
                                      quality: event.target.value,
                                    })
                                  }
                                  placeholder="—"
                                  aria-label={t("workOrderQuality")}
                                  title={row.raw}
                                  aria-invalid={
                                    field === "quality" || undefined
                                  }
                                  className={cn(
                                    cell,
                                    "text-right font-mono",
                                    field === "quality" &&
                                      "bg-red-400/10 text-red-300",
                                  )}
                                />
                              </td>
                              <td>
                                <Input
                                  inputMode="numeric"
                                  value={row.quantity}
                                  onChange={(event) =>
                                    update(row.key, {
                                      quantity: event.target.value,
                                    })
                                  }
                                  placeholder="?"
                                  aria-label={t("workOrderYield")}
                                  title={row.raw}
                                  aria-invalid={
                                    field === "quantity" || undefined
                                  }
                                  className={cn(
                                    cell,
                                    "text-right font-mono",
                                    field === "quantity" &&
                                      "bg-red-400/10 text-red-300 placeholder:text-red-300",
                                  )}
                                />
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRows((prev) =>
                                      prev.filter(
                                        (other) => other.key !== row.key,
                                      ),
                                    )
                                  }
                                  aria-label={t("workOrderRemoveRow")}
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
                    <datalist id="work-order-materials">
                      {REFINED_MATERIALS.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) => [
                          ...prev,
                          {
                            key: nextKey.current++,
                            name: "",
                            quality: "",
                            quantity: "",
                          },
                        ])
                      }
                      className="flex h-10 w-full items-center gap-2 px-3 text-sm text-[#7E9FB7] hover:bg-[#9ED0FF]/5 hover:text-[#CCE7FF]"
                    >
                      <PlusIcon className="size-4" />
                      {t("workOrderAddRow")}
                    </button>
                  </div>

                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#7E9FB7]">
                    <span>
                      {t("workOrderSum", { sum: number.format(sum) })}
                    </span>
                    {total !== undefined && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          total !== sum && "text-amber-300",
                        )}
                      >
                        {total !== sum && (
                          <ExclamationTriangleIcon className="size-3.5" />
                        )}
                        {t("workOrderTotal", { total: number.format(total) })}
                      </span>
                    )}
                  </p>

                  {rows.length === 0 && (
                    <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                      {t("workOrderNothingRead")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {submitError && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {submitError}
            </p>
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-[#7E9FB7]">
            {!location && status === "done"
              ? t("workOrderPickLocation")
              : invalid > 0
                ? t("workOrderInvalid", { count: invalid })
                : null}
          </p>
          <div className="flex gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/inventory">{t("workOrderSeeInventory")}</Link>
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={
                !location || valid.length === 0 || invalid > 0 || submitting
              }
              onClick={submit}
            >
              {submitting
                ? t("adding")
                : t("workOrderSubmit", { count: valid.length })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
