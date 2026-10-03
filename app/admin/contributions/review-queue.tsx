"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
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
import {
  MAX_REJECT_MESSAGE_LENGTH,
  REJECT_REASONS,
  levelForPoints,
  type PendingContribution,
  type RejectReason,
} from "@/types/contributions";
import {
  publishContributionsAction,
  rejectContributionsAction,
  type ReviewActionResult,
} from "./actions";

const GROUPINGS = ["author", "target", "none"] as const;
type Grouping = (typeof GROUPINGS)[number];

/** Au-delà, une contribution est en retard : elle passe en tête et en ambre. */
const LATE_MS = 3 * 24 * 60 * 60 * 1000;

type Group = {
  key: string;
  title: string;
  /** Les points de l'auteur, quand le groupe n'en a qu'un. */
  authorPoints?: number;
  /** Le lieu, quand le groupe n'en vise qu'un. */
  targetSlug?: string;
  items: PendingContribution[];
  oldest: number;
};

function groupItems(
  items: PendingContribution[],
  grouping: Grouping,
  noneTitle: string,
): Group[] {
  const groups = new Map<string, Group>();

  for (const item of items) {
    const key =
      grouping === "author"
        ? item.userId
        : grouping === "target"
          ? item.target.slug
          : "all";
    const created = Date.parse(item.createdAt);
    const group = groups.get(key) ?? {
      key,
      title:
        grouping === "author"
          ? (item.userName ?? "?")
          : grouping === "target"
            ? item.target.name
            : noneTitle,
      authorPoints: grouping === "author" ? item.authorPoints : undefined,
      targetSlug: grouping === "target" ? item.target.slug : undefined,
      items: [],
      oldest: created,
    };
    group.items.push(item);
    group.oldest = Math.min(group.oldest, created);
    groups.set(key, group);
  }

  // Le plus ancien d'abord : c'est ce qui attend depuis le plus longtemps.
  return [...groups.values()].sort((a, b) => a.oldest - b.oldest);
}

/**
 * La file d'attente, faite pour être vidée par lots : regroupée par auteur ou
 * par lieu, chaque groupe se publie ou se refuse d'un coup, et une sélection
 * peut traverser les groupes.
 */
export function ReviewQueue({
  items,
  total,
}: {
  items: PendingContribution[];
  total: number;
}) {
  const t = useTranslations("Contributions.Admin");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const [grouping, setGrouping] = useState<Grouping>("author");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(
    () => groupItems(items, grouping, t("allPending")),
    [items, grouping, t],
  );

  const late = items.filter(
    (item) => now.getTime() - Date.parse(item.createdAt) > LATE_MS,
  ).length;
  const images = items.reduce((sum, item) => sum + item.media.length, 0);
  const authors = new Set(items.map((item) => item.userId)).size;

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function report(result: ReviewActionResult, key: "published" | "rejected") {
    toast.success(t(key, { count: result.done }));
    if (result.skipped > 0) {
      toast.info(t("skipped", { count: result.skipped }));
    }
    setSelected(new Set());
    router.refresh();
  }

  function publish(ids: string[]) {
    startTransition(async () => {
      try {
        report(await publishContributionsAction(ids), "published");
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  function reject(ids: string[], reason: RejectReason, message: string) {
    startTransition(async () => {
      try {
        report(
          await rejectContributionsAction(ids, reason, message),
          "rejected",
        );
        setRejecting(null);
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[#9ED0FF]/25 px-6 py-12 text-center text-[#9ED0FF]/70">
        {t("empty")}
      </p>
    );
  }

  const selectedIds = [...selected];
  const selectedMedia = items
    .filter((item) => selected.has(item.id))
    .reduce((sum, item) => sum + item.media.length, 0);

  return (
    <div className="space-y-5 pb-20">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi value={total} label={t("kpiPending")} />
        <Kpi value={late} label={t("kpiLate")} warn={late > 0} />
        <Kpi value={images} label={t("kpiImages")} />
        <Kpi value={authors} label={t("kpiAuthors")} />
      </div>

      {total > items.length && (
        <p className="text-sm text-amber-200">
          {t("truncated", { shown: items.length, total })}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-[#9ED0FF]/80">
          <input
            type="checkbox"
            className="size-4 accent-[#9ED0FF]"
            checked={selected.size === items.length}
            onChange={(event) =>
              toggle(
                items.map((item) => item.id),
                event.target.checked,
              )
            }
          />
          {t("selectAll")}
        </label>
        <div
          role="group"
          aria-label={t("groupBy")}
          className="flex items-center gap-2 text-sm text-[#9ED0FF]/80"
        >
          {t("groupBy")}
          <div className="flex gap-0.5 rounded-lg border border-[#9ED0FF]/15 bg-[#08243A] p-0.5">
            {GROUPINGS.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={grouping === entry}
                onClick={() => setGrouping(entry)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm",
                  grouping === entry
                    ? "bg-[#123E60] text-[#F2F7FC]"
                    : "text-[#9ED0FF]/70 hover:text-[#CCE7FF]",
                )}
              >
                {t(`groupings.${entry}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const ids = group.items.map((item) => item.id);
          const allOn = ids.every((id) => selected.has(id));
          const isOpen = opened.has(group.key) || grouping === "none";
          const mediaCount = group.items.reduce(
            (sum, item) => sum + item.media.length,
            0,
          );
          const isLate = now.getTime() - group.oldest > LATE_MS;
          const level =
            group.authorPoints !== undefined
              ? levelForPoints(group.authorPoints)
              : undefined;

          return (
            <section
              key={group.key}
              className={cn(
                "overflow-hidden rounded-xl border bg-[#092F49]/60",
                allOn ? "border-[#9ED0FF]" : "border-[#9ED0FF]/15",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <input
                  type="checkbox"
                  aria-label={t("selectGroup", { name: group.title })}
                  className="size-4.5 accent-[#9ED0FF]"
                  checked={allOn}
                  onChange={(event) => toggle(ids, event.target.checked)}
                />
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    {group.targetSlug ? (
                      <Link
                        href={`/lieux/${group.targetSlug}`}
                        className="font-semibold text-[#E3F1FF] hover:underline"
                      >
                        {group.title}
                      </Link>
                    ) : (
                      <strong className="font-semibold text-[#E3F1FF]">
                        {group.title}
                      </strong>
                    )}
                    {level && (
                      <span className="rounded border border-amber-300/60 px-1.5 font-mono text-[10px] font-bold text-amber-200">
                        N{level.level} · {group.authorPoints}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#9ED0FF]/70">
                    {t("groupSummary", {
                      contributions: group.items.length,
                      images: mediaCount,
                    })}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-mono text-xs",
                    isLate ? "text-amber-200" : "text-[#9ED0FF]/60",
                  )}
                >
                  {format.relativeTime(group.oldest, now)}
                </span>
                <div className="flex flex-wrap gap-2">
                  {grouping !== "none" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setOpened((current) => {
                          const next = new Set(current);
                          if (next.has(group.key)) next.delete(group.key);
                          else next.add(group.key);
                          return next;
                        })
                      }
                    >
                      {isOpen ? t("collapse") : t("details")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => publish(ids)}
                    className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
                  >
                    {t("publishGroup", { count: ids.length })}
                  </Button>
                </div>
              </div>

              {isOpen && (
                <ul className="divide-y divide-[#9ED0FF]/8 border-t border-[#9ED0FF]/10">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        aria-label={t("selectOne")}
                        className="size-4 accent-[#9ED0FF]"
                        checked={selected.has(item.id)}
                        onChange={(event) =>
                          toggle([item.id], event.target.checked)
                        }
                      />
                      <div className="flex gap-1.5">
                        {item.media.map((image) => (
                          <a
                            key={image.id}
                            href={image.url}
                            target="_blank"
                            rel="noreferrer"
                            title={image.caption}
                            className="relative block h-14 w-24 overflow-hidden rounded-md border border-[#9ED0FF]/20"
                          >
                            <Image
                              src={image.url}
                              alt={image.caption ?? ""}
                              fill
                              sizes="96px"
                              className="object-cover"
                            />
                          </a>
                        ))}
                      </div>
                      <div className="min-w-0 flex-1 basis-48 text-sm">
                        <Link
                          href={`/lieux/${item.target.slug}`}
                          className="font-medium text-[#E3F1FF] hover:underline"
                        >
                          {item.target.name}
                        </Link>
                        <p className="text-xs text-[#9ED0FF]/65">
                          {[
                            item.userName,
                            format.relativeTime(
                              Date.parse(item.createdAt),
                              now,
                            ),
                            item.gameVersion &&
                              t("gameVersion", { version: item.gameVersion }),
                            ...item.media
                              .map((image) => image.caption)
                              .filter(Boolean),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => setRejecting([item.id])}
                        >
                          {t("reject")}
                        </Button>
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => publish([item.id])}
                        >
                          {t("publish")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label={t("selectionLabel")}
          className="fixed bottom-6 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-[#9ED0FF] bg-[#0E2C45] px-4 py-3 shadow-2xl shadow-black/50"
        >
          <strong className="text-sm text-[#E3F1FF]">
            {t("selection", { count: selected.size, images: selectedMedia })}
          </strong>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            {t("clearSelection")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setRejecting(selectedIds)}
          >
            {t("rejectSelection")}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => publish(selectedIds)}
            className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
          >
            {pending && <Loader2 className="animate-spin" />}
            {t("publishSelection")}
          </Button>
        </div>
      )}

      <RejectDialog
        ids={rejecting}
        pending={pending}
        onClose={() => setRejecting(null)}
        onConfirm={reject}
      />
    </div>
  );
}

function Kpi({
  value,
  label,
  warn,
}: {
  value: number;
  label: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[#092F49]/70 px-4 py-3",
        warn ? "border-amber-300/45" : "border-transparent",
      )}
    >
      <div
        className={cn(
          "font-mono text-2xl font-bold",
          warn ? "text-amber-200" : "text-[#E3F1FF]",
        )}
      >
        {value}
      </div>
      <div className="text-sm text-[#9ED0FF]/70">{label}</div>
    </div>
  );
}

function RejectDialog({
  ids,
  pending,
  onClose,
  onConfirm,
}: {
  ids: string[] | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (ids: string[], reason: RejectReason, message: string) => void;
}) {
  const t = useTranslations("Contributions");
  const [reason, setReason] = useState<RejectReason>("quality");
  const [message, setMessage] = useState("");

  return (
    <Dialog
      open={ids !== null}
      onOpenChange={(open) => {
        if (!open) {
          setMessage("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("Admin.rejectTitle", { count: ids?.length ?? 0 })}
          </DialogTitle>
          <DialogDescription>{t("Admin.rejectDescription")}</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-1.5">
          <legend className="mb-2 text-sm text-[#9ED0FF]/80">
            {t("Admin.rejectReason")}
          </legend>
          {REJECT_REASONS.map((entry) => (
            <label
              key={entry}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="reason"
                className="accent-[#9ED0FF]"
                checked={reason === entry}
                onChange={() => setReason(entry)}
              />
              {t(`reasons.${entry}`)}
            </label>
          ))}
        </fieldset>
        <label className="block space-y-1 text-sm">
          <span className="text-[#9ED0FF]/80">{t("Admin.rejectMessage")}</span>
          <textarea
            rows={3}
            value={message}
            maxLength={MAX_REJECT_MESSAGE_LENGTH}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm dark:bg-input/30"
          />
        </label>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              {t("Admin.cancel")}
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending || (reason === "other" && !message.trim())}
            onClick={() => ids && onConfirm(ids, reason, message)}
          >
            {pending && <Loader2 className="animate-spin" />}
            {t("Admin.rejectConfirm", { count: ids?.length ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
