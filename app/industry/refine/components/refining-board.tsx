"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  BeakerIcon,
  InboxArrowDownIcon,
  PencilIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { QualityBadge } from "@/app/inventory/components";
import {
  isFinished,
  minutesLeft,
  totalQuantity,
  type RefiningJob,
} from "@/lib/refining";
import { cn } from "@/lib/utils";
import { removeRefiningJob } from "../actions";
import JobDialog from "./job-dialog";
import CollectDialog from "./collect-dialog";
import WorkOrderImport from "./work-order-import";
import { formatMinutes } from "./format";

const ICON_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-md text-[#7E9FB7] hover:bg-[#0B3A5A] hover:text-[#CCE7FF]";

/** Toutes les trente secondes : assez pour un compte à la minute. */
function useNow(initial: number) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Le tableau des ordres de raffinage : un résumé (en cours, prêts, volume à
 * récupérer, prochaine fin), puis une carte par ordre avec son compte à
 * rebours, ses matériaux et leur qualité. Un ordre terminé se collecte vers
 * l'inventaire ; collecté, il disparaît.
 */
export default function RefiningBoard({
  jobs,
  now: serverNow,
}: {
  jobs: RefiningJob[];
  /** L'heure du serveur au rendu, pour que le premier affichage concorde. */
  now: number;
}) {
  const t = useTranslations("Refining");
  const locale = useLocale();
  const now = useNow(serverNow);
  const [editing, setEditing] = useState<RefiningJob | null>(null);
  const [creating, setCreating] = useState(false);
  const [collecting, setCollecting] = useState<RefiningJob | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const number = new Intl.NumberFormat(locale);

  const ready = jobs.filter((job) => isFinished(job, now));
  const running = jobs.filter((job) => !isFinished(job, now));
  const volume = jobs.reduce((sum, job) => sum + totalQuantity(job.lines), 0);
  const next = running.length
    ? Math.min(...running.map((job) => minutesLeft(job, now)))
    : null;

  // La dernière raffinerie choisie, proposée pour le prochain ordre.
  const lastLocation = useMemo(() => {
    const latest = [...jobs]
      .filter((job) => job.locationId)
      .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))[0];
    return latest?.locationId
      ? { id: latest.locationId, name: latest.location }
      : null;
  }, [jobs]);

  async function remove(job: RefiningJob) {
    if (deleting) return;
    setDeleting(job.id);
    try {
      const result = await removeRefiningJob(job.id);
      if (result.ok) toast.success(t("jobRemoved"));
      else toast.error(t("errorDelete"));
    } catch {
      toast.error(t("errorDelete"));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" />
          {t("newJob")}
        </Button>
        <WorkOrderImport
          trigger={
            <Button type="button" variant="outline">
              <PhotoIcon className="size-4" />
              {t("importCapture")}
            </Button>
          }
        />
      </div>

      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label={t("statRunning")} value={number.format(running.length)} />
        <Stat
          label={t("statReady")}
          value={number.format(ready.length)}
          tone={ready.length > 0 ? "ready" : undefined}
        />
        <Stat
          label={t("statVolume")}
          value={number.format(volume)}
          unit="cSCU"
        />
        <Stat
          label={t("statNext")}
          value={next === null ? "—" : formatMinutes(next, t)}
        />
      </dl>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#9ED0FF]/25 px-6 py-10 text-center">
          <BeakerIcon className="mx-auto size-8 text-[#9ED0FF]/70" />
          <p className="mt-3 font-medium text-[#CCE7FF]">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-[#7E9FB7]">{t("emptyDescription")}</p>
        </div>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              now={now}
              busy={deleting === job.id}
              onEdit={() => setEditing(job)}
              onCollect={() => setCollecting(job)}
              onDelete={() => void remove(job)}
            />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <JobDialog
          key={editing?.id ?? "new"}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false);
              setEditing(null);
            }
          }}
          job={editing ?? undefined}
          defaultLocation={lastLocation}
        />
      )}
      {collecting && (
        <CollectDialog
          key={collecting.id}
          onOpenChange={(open) => {
            if (!open) setCollecting(null);
          }}
          job={collecting}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "ready";
}) {
  return (
    <div className="rounded-lg border border-[#9ED0FF]/14 bg-[#0A2A42]/70 px-3 py-2.5">
      <dt className="font-mono text-[10.5px] tracking-widest text-[#7E9FB7] uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono text-xl font-bold tabular-nums",
          tone === "ready" ? "text-emerald-300" : "text-[#CCE7FF]",
        )}
      >
        {value}
        {unit && (
          <span className="ml-1 text-xs font-semibold text-[#7E9FB7]">
            {unit}
          </span>
        )}
      </dd>
    </div>
  );
}

function JobCard({
  job,
  now,
  busy,
  onEdit,
  onCollect,
  onDelete,
}: {
  job: RefiningJob;
  now: number;
  busy: boolean;
  onEdit: () => void;
  onCollect: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Refining");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const finished = isFinished(job, now);
  const left = minutesLeft(job, now);
  const since = Math.floor((now - Date.parse(job.endTime)) / 60_000);
  const progress = Math.min(100, Math.max(0, 100 - (left * 100) / job.duration));
  const started = new Date(job.startTime).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = new Date(job.endTime).toLocaleString(locale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const total = totalQuantity(job.lines);

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-3.5 rounded-xl border bg-[#0A2A42] p-4",
        finished
          ? "border-emerald-300/45 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.12)]"
          : "border-[#9ED0FF]/12",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-[#CCE7FF]">
            {job.location}
          </h3>
          <p className="text-xs text-[#7E9FB7]">
            {[job.method, t("startedAt", { date: started })]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px]",
            finished
              ? "border-emerald-300/45 bg-emerald-300/10 text-emerald-300"
              : "border-[#9ED0FF]/35 text-[#9ED0FF]",
          )}
        >
          {finished ? t("ready") : t("running")}
        </span>
      </header>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "font-mono text-lg font-bold tabular-nums",
              finished ? "text-emerald-300" : "text-[#CCE7FF]",
            )}
          >
            {finished ? t("done") : formatMinutes(left, t)}
          </span>
          <span className="text-xs text-[#7E9FB7]">
            {finished
              ? t("readySince", { duration: formatMinutes(Math.max(1, since), t) })
              : t("readyAt", { date: end })}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#9ED0FF]/12">
          <div
            className={cn(
              "h-full rounded-full",
              finished ? "bg-emerald-300" : "bg-[#9ED0FF]",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {job.lines.length > 0 ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left font-mono text-[10.5px] tracking-widest text-[#7E9FB7] uppercase">
              <th className="pb-1.5 font-medium">{t("material")}</th>
              <th className="pb-1.5 font-medium">{t("quality")}</th>
              <th className="pb-1.5 text-right font-medium">cSCU</th>
            </tr>
          </thead>
          <tbody>
            {job.lines.map((line, index) => (
              <tr key={index} className="border-t border-[#9ED0FF]/8">
                <td className="py-1.5 pr-2 text-[#C9E4FF]">{line.name}</td>
                <td className="py-1.5 pr-2">
                  {line.quality !== undefined ? (
                    <QualityBadge quality={line.quality} />
                  ) : (
                    <span className="text-[#7E9FB7]">—</span>
                  )}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums text-[#CCE7FF]">
                  {number.format(line.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#9ED0FF]/8 text-xs text-[#A9BFD0]">
              <td colSpan={2} className="pt-1.5">
                {[
                  t("linesCount", { count: job.lines.length }),
                  job.cost !== undefined &&
                    t("costValue", { cost: number.format(job.cost) }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </td>
              <td className="pt-1.5 text-right font-mono tabular-nums">
                {number.format(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="rounded-lg border border-dashed border-[#9ED0FF]/30 px-3 py-2 text-sm text-[#A9BFD0]">
          {t("legacyContent", { content: job.content ?? "" })}
          <br />
          <span className="text-xs text-[#7E9FB7]">{t("legacyHint")}</span>
        </p>
      )}

      {job.note && <p className="text-xs text-[#A9BFD0]">{job.note}</p>}

      <footer className="mt-auto flex flex-wrap items-center gap-1 border-t border-[#9ED0FF]/10 pt-2.5">
        {finished ? (
          <Button
            type="button"
            size="sm"
            onClick={onCollect}
            className="bg-emerald-300 text-[#053527] hover:bg-emerald-200"
          >
            <InboxArrowDownIcon className="size-4" />
            {t("collect")}
          </Button>
        ) : (
          <span className="text-xs text-[#7E9FB7]">{t("collectLater")}</span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("edit")}
          title={t("edit")}
          className={ICON_BUTTON}
        >
          <PencilIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={t("delete")}
          title={t("delete")}
          className={cn(ICON_BUTTON, "hover:text-red-300 disabled:opacity-50")}
        >
          <TrashIcon className="size-4" />
        </button>
      </footer>
    </article>
  );
}
