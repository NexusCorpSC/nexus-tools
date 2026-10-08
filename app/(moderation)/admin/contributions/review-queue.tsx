"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useNow } from "@/app/orgs/[orgId]/events/shared";
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
  REVIEWER_REJECT_REASONS,
  levelForPoints,
  type PendingContribution,
  type RejectReason,
} from "@/types/contributions";
import { targetHref } from "@/app/contributions/links";
import {
  publishContributionsAction,
  rejectContributionsAction,
  requestChangesAction,
  type ReviewActionResult,
  type ReviewScope,
} from "./actions";
import { ContributionBody } from "./change-table";

const GROUPINGS = ["author", "target", "none"] as const;
type Grouping = (typeof GROUPINGS)[number];

/** Au-delà, une contribution est en retard : elle passe en tête et en ambre. */
const LATE_MS = 3 * 24 * 60 * 60 * 1000;

type Group = {
  key: string;
  title: string;
  /** Les points de l'auteur, quand le groupe n'en a qu'un. */
  authorPoints?: number;
  /** La fiche, quand le groupe n'en vise qu'une. */
  targetHref?: string;
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
          ? `${item.target.type}:${item.target.slug}`
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
      targetHref: grouping === "target" ? targetHref(item) : undefined,
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
  scope = "moderation",
}: {
  items: PendingContribution[];
  total: number;
  /** La vue des Archivistes fait relire en joueur, point de relecture compris. */
  scope?: ReviewScope;
}) {
  const t = useTranslations("Contributions.Admin");
  const tErrors = useTranslations("Contributions.errors");
  const format = useFormatter();
  // `null` au rendu serveur : une durée relative calculée des deux côtés
  // différerait de quelques secondes à l'hydratation.
  const now = useNow();
  const router = useRouter();
  const [grouping, setGrouping] = useState<Grouping>("author");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [requesting, setRequesting] = useState<string[] | null>(null);
  // La contribution que visent les raccourcis : la dernière survolée ou
  // atteinte au clavier.
  const [focused, setFocused] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(
    () => groupItems(items, grouping, t("allPending")),
    [items, grouping, t],
  );

  const late =
    now === null
      ? 0
      : items.filter((item) => now - Date.parse(item.createdAt) > LATE_MS)
          .length;
  const images = items.reduce((sum, item) => sum + item.media.length, 0);
  const authors = new Set(items.map((item) => item.userId)).size;

  const byId = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  /** La version vue de chaque contribution : une reprise depuis l'écarte. */
  function versionsOf(ids: string[]) {
    return Object.fromEntries(ids.map((id) => [id, byId.get(id)?.updatedAt]));
  }

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

  function report(
    result: ReviewActionResult,
    key: "published" | "rejected" | "changesRequested",
  ) {
    if (result.done > 0 || result.failed.length === 0) {
      toast.success(t(key, { count: result.done }));
    }
    if (result.skipped > 0) {
      toast.info(t("skipped", { count: result.skipped }));
    }
    // Ce que la fiche a refusé reste en attente : on dit pourquoi.
    for (const failure of result.failed) {
      toast.error(
        t("actionFailedFor", {
          name: failure.name,
          reason:
            failure.detail ??
            (tErrors.has(failure.error) ? tErrors(failure.error) : t("failed")),
        }),
      );
    }
    setSelected(new Set());
    router.refresh();
  }

  function publish(ids: string[]) {
    startTransition(async () => {
      try {
        report(
          await publishContributionsAction(ids, versionsOf(ids), scope),
          "published",
        );
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  function reject(ids: string[], reason: RejectReason, message: string) {
    startTransition(async () => {
      try {
        report(
          await rejectContributionsAction(
            ids,
            reason,
            message,
            versionsOf(ids),
            scope,
          ),
          "rejected",
        );
        setRejecting(null);
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  function askChanges(ids: string[], message: string) {
    startTransition(async () => {
      try {
        report(
          await requestChangesAction(
            ids,
            message,
            versionsOf(ids),
            scope,
          ),
          "changesRequested",
        );
        setRequesting(null);
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  // P publie, C demande une correction, R refuse — la contribution visée.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable=true]") ||
        rejecting ||
        requesting ||
        pending
      ) {
        return;
      }
      const item = focused ? byId.get(focused) : undefined;
      if (!item) return;
      const key = event.key.toLowerCase();
      if (key === "p") publish([item.id]);
      else if (key === "r") setRejecting([item.id]);
      else if (key === "c" && item.kind !== "media") setRequesting([item.id]);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `publish` change à chaque rendu ; ce qu'il lit est déjà dans la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, byId, rejecting, requesting, pending]);

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
          const isLate = now !== null && now - group.oldest > LATE_MS;
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
                    {group.targetHref ? (
                      <Link
                        href={group.targetHref}
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
                  {now !== null && format.relativeTime(group.oldest, now)}
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
                      tabIndex={-1}
                      onMouseEnter={() => setFocused(item.id)}
                      onFocus={() => setFocused(item.id)}
                      className={cn(
                        "flex flex-wrap items-start gap-3 px-4 py-3 outline-none",
                        focused === item.id && "bg-[#9ED0FF]/[0.04]",
                      )}
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
                      <div className="min-w-0 flex-1 basis-72 space-y-2 text-sm">
                        <div>
                          <span className="mr-2 rounded border border-[#9ED0FF]/25 px-1.5 py-px text-[11px] text-[#9ED0FF]/80">
                            {t(`kinds.${item.kind}`)}
                          </span>
                          <Link
                            href={targetHref(item)}
                            className="font-medium text-[#E3F1FF] hover:underline"
                          >
                            {item.target.name}
                          </Link>
                          {item.kind === "placeCreate" &&
                            item.target.parent && (
                              <span className="text-xs text-[#9ED0FF]/60">
                                {" "}
                                {t("inParent", {
                                  name: item.target.parent.name,
                                })}
                              </span>
                            )}
                          <p className="text-xs text-[#9ED0FF]/65">
                            {[
                              item.userName,
                              now !== null &&
                                format.relativeTime(
                                  Date.parse(item.updatedAt ?? item.createdAt),
                                  now,
                                ),
                              item.gameVersion &&
                                t("gameVersion", { version: item.gameVersion }),
                              item.points > 0 && `+${item.points}`,
                              ...item.media
                                .map((image) => image.caption)
                                .filter(Boolean),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <ContributionBody
                          contribution={item}
                          media={item.media}
                        />
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
                        {item.kind !== "media" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => setRequesting([item.id])}
                          >
                            {t("requestChanges")}
                          </Button>
                        )}
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
          {selectedIds.every((id) => byId.get(id)?.kind !== "media") && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setRequesting(selectedIds)}
            >
              {t("requestChangesSelection")}
            </Button>
          )}
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
        // Un formulaire neuf à chaque ouverture : le motif et le message
        // d'un refus ne doivent pas partir avec le suivant.
        key={rejecting?.join(",") ?? "closed"}
        ids={rejecting}
        imagesOnly={
          rejecting?.every((id) => byId.get(id)?.kind === "media") ?? true
        }
        pending={pending}
        onClose={() => setRejecting(null)}
        onConfirm={reject}
      />

      <RequestChangesDialog
        key={`changes-${requesting?.join(",") ?? "closed"}`}
        ids={requesting}
        pending={pending}
        onClose={() => setRequesting(null)}
        onConfirm={askChanges}
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
  imagesOnly,
  pending,
  onClose,
  onConfirm,
}: {
  ids: string[] | null;
  /** Les motifs d'image d'abord, quand on ne refuse que des images. */
  imagesOnly: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (ids: string[], reason: RejectReason, message: string) => void;
}) {
  const t = useTranslations("Contributions");
  const [reason, setReason] = useState<RejectReason>(
    imagesOnly ? "quality" : "inaccurate",
  );
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
          {REVIEWER_REJECT_REASONS.map((entry) => (
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

/** « À corriger » : l'auteur reprend sa proposition, le message dit quoi. */
function RequestChangesDialog({
  ids,
  pending,
  onClose,
  onConfirm,
}: {
  ids: string[] | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (ids: string[], message: string) => void;
}) {
  const t = useTranslations("Contributions.Admin");
  const [message, setMessage] = useState("");

  return (
    <Dialog
      open={ids !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("requestChangesTitle", { count: ids?.length ?? 0 })}
          </DialogTitle>
          <DialogDescription>
            {t("requestChangesDescription")}
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="text-[#9ED0FF]/80">
            {t("requestChangesMessage")}
          </span>
          <textarea
            rows={4}
            autoFocus
            value={message}
            maxLength={MAX_REJECT_MESSAGE_LENGTH}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm dark:bg-input/30"
          />
        </label>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={pending || !message.trim()}
            onClick={() => ids && onConfirm(ids, message)}
          >
            {pending && <Loader2 className="animate-spin" />}
            {t("requestChangesConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
