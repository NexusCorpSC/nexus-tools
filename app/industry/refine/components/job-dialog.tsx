"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
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
} from "@/components/ui/dialog";
import { LocationCombobox } from "@/app/inventory/components";
import type { Location } from "@/types/inventory";
import {
  formatDurationInput,
  MAX_REFINING_DURATION,
  MAX_REFINING_LINES,
  parseDuration,
  REFINING_METHODS,
  type RefiningJob,
} from "@/lib/refining";
import { cn } from "@/lib/utils";
import { addRefiningJob, editRefiningJob } from "../actions";
import {
  checkDraft,
  isBlank,
  LineDraft,
  LinesTable,
  toDraft,
} from "./lines-table";
import { formatMinutes } from "./format";

const LABEL = "text-xs font-semibold tracking-wider text-[#7E9FB7] uppercase";
const FIELD =
  "h-9 w-full rounded-md border border-[#9ED0FF]/25 bg-[#092F49] px-3 text-sm text-[#E6F3FF]";

/**
 * Lancer le suivi d'un ordre, ou le modifier : raffinerie, méthode, durée,
 * coût, matériaux attendus et note. Un ancien ordre en texte libre montre son
 * texte au-dessus des lignes, pour le recopier.
 */
export default function JobDialog({
  onOpenChange,
  job,
  defaultLocation,
}: {
  onOpenChange: (open: boolean) => void;
  /** L'ordre à modifier ; absent pour un nouvel ordre. */
  job?: RefiningJob;
  /** La dernière raffinerie utilisée, proposée pour un nouvel ordre. */
  defaultLocation?: Location | null;
}) {
  const t = useTranslations("Refining");
  const locale = useLocale();
  // Le formulaire part de l'ordre, ou de rien : le dialogue est monté à
  // chaque ouverture.
  const [openedAt] = useState(() => Date.now());
  const [location, setLocation] = useState<Location | null>(() =>
    job
      ? job.locationId
        ? { id: job.locationId, name: job.location }
        : null
      : (defaultLocation ?? null),
  );
  const [method, setMethod] = useState(job?.method ?? "");
  const [duration, setDuration] = useState(() =>
    job ? formatDurationInput(job.duration) : "",
  );
  const [cost, setCost] = useState(job?.cost?.toString() ?? "");
  const [note, setNote] = useState(job?.note ?? "");
  const [rows, setRows] = useState<LineDraft[]>(() =>
    job && job.lines.length > 0
      ? job.lines.map((line) => toDraft(line))
      : [toDraft({})],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseDuration(duration);
  // Au-delà de ce que le serveur accepte : signalé ici plutôt qu'au retour.
  const tooLong = parsed !== null && parsed > MAX_REFINING_DURATION;
  const minutes = tooLong ? null : parsed;
  const checked = rows.filter((row) => !isBlank(row)).map(checkDraft);
  const lines = checked.flatMap((result) => (result.ok ? [result.line] : []));
  const invalid = checked.length - lines.length;
  const costValue = cost.trim() === "" ? undefined : Number(cost);
  const costInvalid =
    costValue !== undefined && (!Number.isInteger(costValue) || costValue < 0);
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  const number = new Intl.NumberFormat(locale);

  // L'heure de fin : depuis maintenant pour un nouvel ordre, depuis son
  // départ pour un ordre modifié.
  const start = job ? Date.parse(job.startTime) : openedAt;
  const end =
    minutes !== null
      ? new Date(start + minutes * 60_000).toLocaleString(locale, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  const canSubmit =
    !!location &&
    minutes !== null &&
    lines.length > 0 &&
    lines.length <= MAX_REFINING_LINES &&
    invalid === 0 &&
    !costInvalid &&
    !submitting;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !location || minutes === null) return;

    setSubmitting(true);
    setError(null);
    const input = {
      locationId: location.id,
      method: method || undefined,
      lines,
      cost: costValue,
      note: note.trim() || undefined,
      duration: minutes,
    };
    try {
      const result = job
        ? await editRefiningJob(job.id, input)
        : await addRefiningJob(input);
      if (!result.ok) {
        setError(
          result.error === "invalid_location"
            ? t("errorLocation")
            : t("errorSave"),
        );
        return;
      }
      toast.success(job ? t("jobSaved") : t("jobCreated"));
      onOpenChange(false);
    } catch {
      setError(t("errorSave"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{job ? t("editJob") : t("newJob")}</DialogTitle>
            <DialogDescription>{t("jobDialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <span className={LABEL}>{t("refinery")}</span>
              <LocationCombobox
                value={location}
                onChange={setLocation}
                placeholder={
                  job && !job.locationId
                    ? job.location
                    : t("refineryPlaceholder")
                }
                aria-label={t("refinery")}
                inputClassName="h-9 bg-[#092F49]"
              />
              <p className="text-xs text-[#7E9FB7]">{t("refineryHint")}</p>
            </div>
            <label className="space-y-1">
              <span className={LABEL}>
                {t("method")}{" "}
                <span className="font-normal normal-case">{t("optional")}</span>
              </span>
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                className={FIELD}
              >
                <option value="">{t("methodNone")}</option>
                {REFINING_METHODS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={LABEL}>{t("duration")}</span>
              <Input
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                placeholder={t("durationPlaceholder")}
                aria-invalid={
                  (duration !== "" && minutes === null) || undefined
                }
                className="h-9 bg-[#092F49] font-mono"
              />
              {duration !== "" &&
                (minutes === null ? (
                  <p className="text-xs text-red-300">
                    {tooLong ? t("durationTooLong") : t("durationInvalid")}
                  </p>
                ) : (
                  <p className="text-xs text-emerald-300">
                    {t("durationEquivalent", {
                      duration: formatMinutes(minutes, t),
                      end: end ?? "",
                    })}
                  </p>
                ))}
            </label>
            <label className="space-y-1">
              <span className={LABEL}>
                {t("cost")}{" "}
                <span className="font-normal normal-case">{t("optional")}</span>
              </span>
              <div className="relative">
                <Input
                  inputMode="numeric"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  aria-invalid={costInvalid || undefined}
                  className={cn(
                    "h-9 bg-[#092F49] pr-14 font-mono",
                    costInvalid && "text-red-300",
                  )}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs text-[#7E9FB7]">
                  aUEC
                </span>
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <span className={LABEL}>{t("expectedMaterials")}</span>
            {job?.content && (
              <p className="rounded-md border border-dashed border-[#9ED0FF]/30 px-3 py-2 text-sm text-[#A9BFD0]">
                {t("legacyContent", { content: job.content })}
              </p>
            )}
            <LinesTable rows={rows} onChange={setRows} />
            <p className="text-xs text-[#7E9FB7]">{t("linesHint")}</p>
          </div>

          <label className="block space-y-1">
            <span className={LABEL}>
              {t("note")}{" "}
              <span className="font-normal normal-case">{t("optional")}</span>
            </span>
            <Input
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("notePlaceholder")}
              className="h-9 bg-[#092F49]"
            />
          </label>

          {error && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <p className="text-xs text-[#7E9FB7]">
              {invalid > 0
                ? t("linesInvalid", { count: invalid })
                : lines.length > MAX_REFINING_LINES
                  ? t("linesTooMany", { max: MAX_REFINING_LINES })
                  : t("linesSum", {
                      count: lines.length,
                      total: number.format(total),
                    })}
            </p>
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!canSubmit}>
                {submitting
                  ? t("saving")
                  : job
                    ? t("saveChanges")
                    : t("startTracking")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
