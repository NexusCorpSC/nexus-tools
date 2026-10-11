"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { InboxArrowDownIcon, PhotoIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LocationCombobox } from "@/app/inventory/components";
import type { Location } from "@/types/inventory";
import type { RefiningJob } from "@/lib/refining";
import { readWorkOrderCapture } from "@/lib/work-order-ocr";
import { cn, roundQty } from "@/lib/utils";
import { collectJob } from "../actions";
import { checkDraft, draftKey, LineDraft, LinesTable, toDraft } from "./lines-table";

type Unit = "cSCU" | "SCU";

/** Un lot déjà rangé au lieu choisi, pour annoncer ceux qui seront complétés. */
type HeldLot = {
  name: string;
  quality?: number;
  unit?: string;
  description?: string;
};

const LABEL = "text-xs font-semibold tracking-wider text-[#7E9FB7] uppercase";

/** Ce que le terminal rend sans valeur : décoché par défaut. */
function isInert(name: string) {
  return /inert/i.test(name);
}

function same(a: string | undefined, b: string | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/**
 * La collecte d'un ordre terminé : ses lignes, déjà remplies, partent dans
 * l'inventaire à la raffinerie (ou au lieu choisi), et l'ordre disparaît.
 *
 * Une capture du panneau de fin peut remplacer les lignes quand le rendement
 * réel diffère. La colonne de droite annonce, ligne par ligne, si elle
 * complète un lot déjà là (même matériau, qualité et unité, sans note) ou en
 * crée un, comme l'ajout rapide le fera.
 */
export default function CollectDialog({
  onOpenChange,
  job,
}: {
  onOpenChange: (open: boolean) => void;
  job: RefiningJob;
}) {
  const t = useTranslations("Refining");
  const locale = useLocale();
  const router = useRouter();
  // Le dialogue est monté à chaque ouverture : il part des lignes de l'ordre,
  // matières inertes décochées.
  const [rows, setRows] = useState<LineDraft[]>(() =>
    job.lines.length > 0
      ? job.lines.map((line) => toDraft(line, !isInert(line.name)))
      : [toDraft({})],
  );
  const [location, setLocation] = useState<Location | null>(() =>
    job.locationId ? { id: job.locationId, name: job.location } : null,
  );
  const [unit, setUnit] = useState<Unit>("cSCU");
  const [orgVisible, setOrgVisible] = useState(false);
  const [heldAt, setHeldAt] = useState<{ id: string; lots: HeldLot[] } | null>(
    null,
  );
  const [reading, setReading] = useState<number | null>(null);
  const [readError, setReadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bumped on every read and when the dialog closes: a read that ends after
  // that must not bring its lines back.
  const runRef = useRef(0);
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    [],
  );

  // Un ancien ordre n'a que le nom de sa raffinerie : retrouvé parmi les
  // lieux quand il y est tel quel.
  useEffect(() => {
    const hint = job.location.trim();
    if (job.locationId || location || !hint) return;
    let cancelled = false;
    fetch(`/api/inventory/locations?query=${encodeURIComponent(hint)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((found: Location[]) => {
        const match = found.find((place) => same(place.name, hint));
        if (match && !cancelled) setLocation((current) => current ?? match);
      })
      .catch(() => {
        // Choisi à la main alors.
      });
    return () => {
      cancelled = true;
    };
  }, [job, location]);

  // Les lots déjà au lieu choisi, pour annoncer ceux qui seront complétés.
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    fetch(`/api/inventory/items?locationId=${encodeURIComponent(location.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((lots: HeldLot[] | null) => {
        if (!cancelled && lots) setHeldAt({ id: location.id, lots });
      })
      .catch(() => {
        // Sans aperçu alors.
      });
    return () => {
      cancelled = true;
    };
  }, [location]);
  const held = heldAt && heldAt.id === location?.id ? heldAt.lots : null;

  const readImage = useCallback(async (file: File) => {
    const run = (runRef.current += 1);
    setReading(0);
    setReadError(false);
    try {
      const parsed = await readWorkOrderCapture(file, (percent) => {
        if (runRef.current === run) setReading(percent);
      });
      if (runRef.current !== run) return;
      if (parsed.lines.length === 0) {
        setReadError(true);
      } else {
        setRows(
          parsed.lines.map((line) => ({
            key: draftKey(),
            name: line.name,
            quality: line.quality?.toString() ?? "",
            quantity: line.quantity?.toString() ?? "",
            take: !isInert(line.name),
            raw: line.raw,
          })),
        );
      }
    } catch (cause) {
      console.error(cause);
      if (runRef.current === run) setReadError(true);
    } finally {
      if (runRef.current === run) setReading(null);
    }
  }, []);

  // Ctrl+V d'une capture, comme dans l'import.
  useEffect(() => {
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
  }, [readImage]);

  const taken = rows.filter((row) => row.take);
  const checked = taken.map(checkDraft);
  const lines = checked.flatMap((result) => (result.ok ? [result.line] : []));
  const invalid = checked.length - lines.length;
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const outcome = (row: LineDraft) => {
    if (!row.take) return <span className="text-[#7E9FB7]">{t("collectLeft")}</span>;
    const result = checkDraft(row);
    if (!result.ok || !held) return null;
    const match = held.find(
      (lot) =>
        same(lot.name, result.line.name) &&
        same(lot.unit, unit) &&
        !lot.description?.trim() &&
        (lot.quality ?? undefined) === result.line.quality,
    );
    return match ? (
      <span className="text-emerald-300">{t("collectMerge")}</span>
    ) : (
      <span className="text-[#7E9FB7]">{t("collectNew")}</span>
    );
  };

  async function send(withLines: boolean) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await collectJob(job.id, {
        lines: withLines ? lines : [],
        locationId: location?.id ?? "",
        unit,
        orgVisible,
      });
      if (!result.ok) {
        setError(
          result.error === "invalid_location"
            ? t("errorLocation")
            : result.error === "not_found"
              ? t("errorGone")
              : t("errorCollect"),
        );
        return;
      }
      if (withLines) {
        toast.success(t("collectDone", { name: location?.name ?? "" }), {
          description: t("collectDoneDescription", {
            created: result.created,
            merged: result.merged,
          }),
          action: {
            label: t("seeInventory"),
            onClick: () => router.push("/inventory"),
          },
        });
      } else {
        toast.success(t("jobRemoved"));
      }
      onOpenChange(false);
    } catch {
      setError(t("errorCollect"));
    } finally {
      setSubmitting(false);
    }
  }

  const canCollect =
    !!location && lines.length > 0 && invalid === 0 && !submitting;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("collectTitle")}</DialogTitle>
          <DialogDescription>
            {[job.location, job.method].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file?.type.startsWith("image/")) void readImage(file);
            }}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-[#9ED0FF]/30 px-3 py-2.5 text-sm text-[#A9BFD0]"
          >
            <PhotoIcon className="size-5 shrink-0 text-[#9ED0FF]" />
            <span className="min-w-0 flex-1">
              {reading !== null
                ? t("collectReading", { progress: reading })
                : t("collectCaptureHint")}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readImage(file);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={reading !== null}
              onClick={() => inputRef.current?.click()}
            >
              {t("collectReadCapture")}
            </Button>
          </div>
          {readError && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {t("collectReadError")}
            </p>
          )}

          {job.content && (
            <p className="rounded-md border border-dashed border-[#9ED0FF]/30 px-3 py-2 text-sm text-[#A9BFD0]">
              {t("legacyContent", { content: job.content })}
            </p>
          )}

          <LinesTable
            rows={rows}
            onChange={setRows}
            selectable
            outcome={location ? outcome : undefined}
          />

          <div className="flex flex-wrap items-start gap-x-6 gap-y-3 rounded-xl border border-[#9ED0FF]/14 bg-[#0A2A42] px-4 py-3">
            <div className="min-w-56 flex-1 space-y-1">
              <span className={LABEL}>{t("collectLocation")}</span>
              <LocationCombobox
                value={location}
                onChange={setLocation}
                placeholder={job.location || t("refineryPlaceholder")}
                aria-label={t("collectLocation")}
                inputClassName="h-9 bg-[#092F49]"
              />
              <p className="text-xs text-[#7E9FB7]">{t("collectLocationHint")}</p>
            </div>
            <div className="space-y-1">
              <span className={LABEL}>{t("collectUnit")}</span>
              <div className="flex h-9 overflow-hidden rounded-md border border-[#9ED0FF]/25">
                {(["cSCU", "SCU"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setUnit(option)}
                    aria-pressed={unit === option}
                    className={cn(
                      "px-3 font-mono text-sm",
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
            <label className="flex h-9 cursor-pointer items-center gap-2 self-end text-sm text-[#C9E4FF] sm:mt-5">
              <input
                type="checkbox"
                checked={orgVisible}
                onChange={(event) => setOrgVisible(event.target.checked)}
                className="size-3.5 accent-[#9ED0FF]"
              />
              {t("orgVisible")}
            </label>
          </div>

          {error && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-[#7E9FB7]">
            {!location
              ? t("collectPickLocation")
              : invalid > 0
                ? t("linesInvalid", { count: invalid })
                : t("collectSum", {
                    count: lines.length,
                    total: number.format(
                      unit === "SCU" ? roundQty(total / 100) : total,
                    ),
                    unit,
                  })}
          </p>
          <div className="flex flex-wrap gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => void send(false)}
            >
              {t("collectDiscard")}
            </Button>
            <Button
              type="button"
              disabled={!canCollect}
              onClick={() => void send(true)}
              className="bg-emerald-300 text-[#053527] hover:bg-emerald-200"
            >
              <InboxArrowDownIcon className="size-4" />
              {submitting ? t("adding") : t("collectSubmit")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
