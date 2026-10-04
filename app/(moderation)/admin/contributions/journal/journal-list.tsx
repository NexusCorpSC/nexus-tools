"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";
import type {
  ContributionChange,
  ContributionStatus,
  PendingContribution,
} from "@/types/contributions";
import { targetHref } from "@/app/contributions/links";
import { revertContributionAction } from "../actions";
import { ChangeTable, ContributionBody } from "../change-table";

const STATUS_TONE: Record<ContributionStatus, string> = {
  pending: "border-sky-300/40 text-sky-200",
  publishing: "border-sky-300/40 text-sky-200",
  changesRequested: "border-amber-300/50 text-amber-200",
  published: "border-emerald-300/40 text-emerald-200",
  rejected: "border-red-300/40 text-red-200",
  reverted: "border-red-300/40 text-red-200",
};

/** Le journal, une ligne par décision, et « Annuler » sur ce qui est publié. */
export function JournalList({ entries }: { entries: PendingContribution[] }) {
  const t = useTranslations("Contributions.Admin");
  const tMine = useTranslations("Contributions.Mine");
  const tErrors = useTranslations("Contributions.errors");
  const tReasons = useTranslations("Contributions.reasons");
  const format = useFormatter();
  const router = useRouter();
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [conflict, setConflict] = useState<{
    id: string;
    changes: ContributionChange[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function revert(id: string, force = false) {
    startTransition(async () => {
      try {
        const result = await revertContributionAction(id, force);
        if (result.ok) {
          toast.success(t("reverted"));
          setConflict(null);
          router.refresh();
        } else if (result.error === "revertConflict") {
          setConflict({ id, changes: result.conflicts ?? [] });
        } else {
          toast.error(
            tErrors.has(result.error) ? tErrors(result.error) : t("failed"),
          );
        }
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[#9ED0FF]/25 px-6 py-12 text-center text-[#9ED0FF]/70">
        {t("journalEmpty")}
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-[#9ED0FF]/8 overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/60">
        {entries.map((entry) => {
          const isOpen = opened.has(entry.id);
          const decidedBy = entry.revert?.byName ?? entry.review?.byName;
          const date = entry.updatedAt ?? entry.publishedAt ?? entry.createdAt;
          const direct = entry.status === "published" && !entry.review;

          return (
            <li key={entry.id} className="space-y-2 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-semibold",
                    STATUS_TONE[entry.status],
                  )}
                >
                  {tMine(`statuses.${entry.status}`)}
                </span>
                {direct && (
                  <span className="rounded border border-amber-300/40 px-1.5 text-[11px] text-amber-200">
                    {t("direct")}
                  </span>
                )}
                <span className="rounded border border-[#9ED0FF]/25 px-1.5 py-px text-[11px] text-[#9ED0FF]/80">
                  {t(`kinds.${entry.kind}`)}
                </span>
                <Link
                  href={targetHref(entry)}
                  className="font-medium text-[#E3F1FF] hover:underline"
                >
                  {entry.target.name}
                </Link>
                <span className="text-xs text-[#9ED0FF]/65">
                  {[
                    entry.userName,
                    decidedBy && t("decidedBy", { name: decidedBy }),
                    format.dateTime(new Date(date), {
                      dateStyle: "short",
                      timeStyle: "short",
                    }),
                    entry.points > 0 && `+${entry.points}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setOpened((current) => {
                        const next = new Set(current);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        return next;
                      })
                    }
                  >
                    {isOpen ? t("collapse") : t("details")}
                  </Button>
                  {entry.status === "published" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => revert(entry.id)}
                    >
                      {t("revert")}
                    </Button>
                  )}
                </span>
              </div>
              {entry.review &&
                (entry.review.reason || entry.review.message) && (
                  <p className="text-xs text-amber-50/85">
                    {entry.review.reason && tReasons(entry.review.reason)}
                    {entry.review.reason && entry.review.message && " · "}
                    {entry.review.message && `« ${entry.review.message} »`}
                  </p>
                )}
              {isOpen && (
                <ContributionBody contribution={entry} media={entry.media} />
              )}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={conflict !== null}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("conflictTitle")}</DialogTitle>
            <DialogDescription>{t("conflictDescription")}</DialogDescription>
          </DialogHeader>
          {conflict && conflict.changes.length > 0 && (
            <ChangeTable
              changes={conflict.changes}
              beforeLabel={t("conflictPublished")}
              afterLabel={t("conflictNow")}
            />
          )}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => conflict && revert(conflict.id, true)}
            >
              {pending && <Loader2 className="animate-spin" />}
              {t("conflictConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
