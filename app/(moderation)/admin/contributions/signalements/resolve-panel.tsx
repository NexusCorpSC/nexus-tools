"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MAX_RESOLUTION_NOTE_LENGTH,
  type ReportAction,
  type ReportSanction,
} from "@/types/reports";
import { resolveReportAction } from "./actions";

type Option = { id: string; label: string };

/**
 * La décision sur un dossier : classer, corriger soi-même, annuler la
 * contribution en cause ou retirer l'élément, et en plus avertir ou suspendre
 * son auteur. Retirer demande une seconde confirmation.
 */
export function ResolvePanel({
  reportId,
  actions,
  gone,
  history,
  authors,
}: {
  reportId: string;
  actions: ReportAction[];
  gone: boolean;
  /** Les contributions publiées qu'on peut annuler. */
  history: Option[];
  authors: Option[];
}) {
  const t = useTranslations("Reports.Admin");
  const tErrors = useTranslations("Reports.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const available = actions.filter(
    (action) =>
      (action !== "revert" || history.length > 0) &&
      (action !== "delete" || !gone),
  );
  const [action, setAction] = useState<ReportAction>("dismiss");
  const [contributionId, setContributionId] = useState(history[0]?.id ?? "");
  const [sanction, setSanction] = useState<ReportSanction | "">("");
  const [authorId, setAuthorId] = useState(authors[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(force = false) {
    if (action === "delete" && !confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resolveReportAction(reportId, {
        action,
        note: note.trim() || undefined,
        contributionId: action === "revert" ? contributionId : undefined,
        force,
        sanction: sanction || undefined,
        authorId: sanction ? authorId : undefined,
      });
      if (result.ok) {
        toast.success(t(`done.${action}`));
        router.replace("/admin/contributions/signalements");
        router.refresh();
        return;
      }
      setConfirming(false);
      if (result.detail === "revertConflict") {
        setConflict(true);
        return;
      }
      setError(
        result.detail
          ? `${tErrors(result.error)} ${result.detail}`
          : tErrors(result.error),
      );
    });
  }

  return (
    <div className="space-y-4 border-t border-[#9ED0FF]/15 pt-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
          {t("decision")}
        </legend>
        {available.map((entry) => (
          <label
            key={entry}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm",
              action === entry
                ? "border-[#9ED0FF] bg-[#9ED0FF]/8"
                : "border-[#9ED0FF]/16",
            )}
          >
            <input
              type="radio"
              name="report-action"
              checked={action === entry}
              onChange={() => {
                setAction(entry);
                setConfirming(false);
                setConflict(false);
              }}
              className="mt-0.5 size-4 accent-[#9ED0FF]"
            />
            <span>
              {t(`actions.${entry}.label`)}
              <small className="mt-0.5 block text-xs text-[#F2F7FC]/60">
                {t(`actions.${entry}.hint`)}
              </small>
            </span>
          </label>
        ))}
      </fieldset>

      {action === "revert" && (
        <label className="flex flex-col gap-1.5 text-sm">
          {t("contribution")}
          <select
            value={contributionId}
            onChange={(event) => {
              setContributionId(event.target.value);
              setConflict(false);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {history.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {authors.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            {t("sanction")}
            <select
              value={sanction}
              onChange={(event) =>
                setSanction(event.target.value as ReportSanction | "")
              }
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">{t("sanctions.none")}</option>
              <option value="warn">{t("sanctions.warn")}</option>
              <option value="suspend">{t("sanctions.suspend")}</option>
            </select>
          </label>
          {sanction && (
            <label className="flex flex-col gap-1.5 text-sm">
              {t("author")}
              <select
                value={authorId}
                onChange={(event) => setAuthorId(event.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {authors.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        {t("note")}
        <Textarea
          rows={2}
          value={note}
          maxLength={MAX_RESOLUTION_NOTE_LENGTH}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {conflict && (
        <div className="space-y-2 rounded-lg border border-[#F2B880]/55 px-3 py-2 text-sm text-[#F7D2AE]">
          <p>{t("conflict")}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => submit(true)}
          >
            {t("conflictConfirm")}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          disabled={pending || (action === "revert" && !contributionId)}
          variant={action === "delete" ? "destructive" : "default"}
          onClick={() => submit()}
        >
          {confirming ? t("confirmDelete") : t(`actions.${action}.submit`)}
        </Button>
      </div>
    </div>
  );
}
