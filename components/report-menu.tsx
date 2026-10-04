"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CheckCircleIcon,
  EllipsisHorizontalIcon,
  FlagIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  MAX_REPORT_COMMENT_LENGTH,
  REPORT_REASONS,
  REPORT_UPHELD_POINTS,
  type ReportErrorCode,
  type ReportReason,
  type ReportTargetType,
} from "@/types/reports";

/**
 * Le menu « … » d'un élément, avec son entrée discrète : Signaler. Le
 * formulaire est le même partout, sur le site comme dans l'app.
 */
export function ReportMenu({
  type,
  id,
  name,
  fixHref,
  className,
}: {
  type: ReportTargetType;
  /** La clé de la cible, telle que `POST /api/reports` l'attend. */
  id: string;
  name: string;
  /** Où proposer soi-même la correction, une fois le signalement envoyé. */
  fixHref?: string;
  className?: string;
}) {
  const t = useTranslations("Reports");
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label={t("menu")}
        aria-expanded={menu}
        onClick={() => setMenu((value) => !value)}
        className="inline-flex size-8 items-center justify-center rounded-md border border-[#9ED0FF]/30 text-nexus transition-colors hover:bg-white/10"
      >
        <EllipsisHorizontalIcon className="size-5" />
      </button>

      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-[#9ED0FF]/20 bg-nexus-bg py-1 shadow-md">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-white/10"
              onClick={() => {
                setMenu(false);
                setDialog(true);
              }}
            >
              <FlagIcon className="size-4" />
              {t("report")}
            </button>
          </div>
        </>
      )}

      {dialog && (
        <ReportDialog
          type={type}
          id={id}
          name={name}
          fixHref={fixHref}
          onClose={() => setDialog(false)}
        />
      )}
    </div>
  );
}

function ReportDialog({
  type,
  id,
  name,
  fixHref,
  onClose,
}: {
  type: ReportTargetType;
  id: string;
  name: string;
  fixHref?: string;
  onClose: () => void;
}) {
  const t = useTranslations("Reports");
  const pathname = usePathname();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ReportErrorCode | "failed" | null>(null);
  const [done, setDone] = useState(false);

  const needsComment = reason === "other" && comment.trim().length === 0;

  async function send() {
    if (!reason || needsComment) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: { type, id },
          reason,
          comment: comment.trim() || undefined,
        }),
      });
      if (response.ok) {
        setDone(true);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(
        t.has(`errors.${body.error}`)
          ? (body.error as ReportErrorCode)
          : "failed",
      );
    } catch {
      setError("failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {done ? (
          <div role="status" className="flex flex-col items-start gap-3">
            <CheckCircleIcon className="size-8 text-emerald-300" />
            <DialogHeader>
              <DialogTitle>{t("doneTitle")}</DialogTitle>
              <DialogDescription>
                {t("doneBody", { points: REPORT_UPHELD_POINTS })}
              </DialogDescription>
            </DialogHeader>
            {fixHref && (
              <p className="text-sm text-muted-foreground">{t("doneFix")}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onClose}>
                {t("close")}
              </Button>
              {fixHref && (
                <Button asChild>
                  <Link href={fixHref}>{t("proposeFix")}</Link>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t(`title.${type}`)}</DialogTitle>
              <DialogDescription>{t("subtitle", { name })}</DialogDescription>
            </DialogHeader>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold text-nexus">
                {t("question")}
              </legend>
              {REPORT_REASONS.map((entry) => (
                <label
                  key={entry}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                    reason === entry
                      ? "border-[#9ED0FF] bg-[#9ED0FF]/8"
                      : "border-[#9ED0FF]/16 hover:bg-white/5",
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={entry}
                    checked={reason === entry}
                    onChange={() => setReason(entry)}
                    className="mt-0.5 size-4 accent-[#9ED0FF]"
                  />
                  <span>
                    {t(`reasons.${entry}.label`)}
                    <small className="mt-0.5 block text-xs text-muted-foreground">
                      {t(`reasons.${entry}.hint`)}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1.5 text-sm text-nexus">
              {reason === "other" ? t("commentRequired") : t("comment")}
              <Textarea
                rows={3}
                value={comment}
                maxLength={MAX_REPORT_COMMENT_LENGTH}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>

            {error && (
              <p role="alert" className="text-sm text-red-300">
                {t(`errors.${error}`)}
                {error === "unauthenticated" && (
                  <>
                    {" "}
                    <Link
                      href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
                      className="underline"
                    >
                      {t("signIn")}
                    </Link>
                  </>
                )}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button
                onClick={() => void send()}
                disabled={!reason || needsComment || sending}
              >
                {sending ? t("sending") : t("send")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Le bandeau d'une fiche que des joueurs contestent : elle reste lisible, et
 * le visiteur sait qu'un modérateur vérifie.
 */
export function ContestedBanner({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <p
      role="note"
      className={cn(
        "flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-300/[0.08] px-4 py-2.5 text-sm text-amber-50/90",
        className,
      )}
    >
      <FlagIcon className="size-4 shrink-0 text-amber-200" />
      {message}
    </p>
  );
}
