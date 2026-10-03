import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { listMyContributions } from "@/lib/contributions";
import { cn } from "@/lib/utils";
import {
  CHANGES_REQUESTED_TTL_DAYS,
  type Contribution,
  type ContributionStatus,
} from "@/types/contributions";
import { resumeHref, targetHref } from "./links";
import { requireContributor } from "./session";

export const metadata: Metadata = {
  title: "Mes contributions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ContributionStatus, string> = {
  pending: "border-sky-300/40 text-sky-200",
  publishing: "border-sky-300/40 text-sky-200",
  changesRequested: "border-amber-300/50 text-amber-200",
  published: "border-emerald-300/40 text-emerald-200",
  rejected: "border-red-300/40 text-red-200",
  reverted: "border-red-300/40 text-red-200",
};

/**
 * Ce que le joueur a apporté : son niveau, ce qui attend, ce qu'on lui a
 * renvoyé à corriger, et ce qui a été publié, refusé ou annulé.
 */
export default async function MyContributionsPage() {
  const { userId, standing } = await requireContributor("/contributions");
  const contributions = await listMyContributions(userId, 100);
  const t = await getTranslations("Contributions.Mine");
  const tLevels = await getTranslations("Contributions.levels");
  const format = await getFormatter();

  const toFix = contributions.filter(
    (entry) => entry.status === "changesRequested",
  );
  const others = contributions.filter(
    (entry) => entry.status !== "changesRequested",
  );

  return (
    <div className="m-2 mx-auto max-w-4xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      <div className="flex flex-wrap overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35">
        <Figure
          label={t("level")}
          value={`N${standing.level} · ${tLevels(standing.levelKey)}`}
        />
        <Figure
          label={t("points")}
          value={
            standing.nextLevelPoints
              ? `${standing.points} / ${standing.nextLevelPoints}`
              : String(standing.points)
          }
        />
        <Figure
          label={t("acceptance")}
          value={
            standing.acceptanceRate === undefined
              ? "—"
              : format.number(standing.acceptanceRate, { style: "percent" })
          }
        />
        <Figure label={t("pending")} value={String(standing.pending)} />
      </div>

      {toFix.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200">
            {t("toFixTitle", { count: toFix.length })}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("toFixHint", { days: CHANGES_REQUESTED_TTL_DAYS })}
          </p>
          <ul className="space-y-2">
            {toFix.map((contribution) => (
              <ContributionRow
                key={contribution.id}
                contribution={contribution}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-nexus-primary">
          {t("historyTitle")}
        </h2>
        {others.length > 0 ? (
          <ul className="space-y-2">
            {others.map((contribution) => (
              <ContributionRow
                key={contribution.id}
                contribution={contribution}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-[#9ED0FF]/25 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}{" "}
            <Link href="/lieux" className="text-primary hover:underline">
              {t("emptyPlaces")}
            </Link>
            {" · "}
            <Link href="/items" className="text-primary hover:underline">
              {t("emptyItems")}
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-32 flex-1 border-r border-[#9ED0FF]/10 px-4 py-3 last:border-r-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

async function ContributionRow({
  contribution,
}: {
  contribution: Contribution;
}) {
  const t = await getTranslations("Contributions.Mine");
  const tReasons = await getTranslations("Contributions.reasons");
  const format = await getFormatter();
  const { review } = contribution;
  const open =
    contribution.status === "pending" ||
    contribution.status === "changesRequested";
  const date = contribution.updatedAt ?? contribution.createdAt;

  return (
    <li className="space-y-1.5 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={cn(
            "inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-semibold",
            STATUS_TONE[contribution.status],
          )}
        >
          {t(`statuses.${contribution.status}`)}
        </span>
        <span className="text-muted-foreground">
          {t(`kinds.${contribution.kind}`)}
        </span>
        <Link
          href={targetHref(contribution)}
          className="font-medium text-nexus hover:underline"
        >
          {contribution.target.name}
        </Link>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {contribution.points !== 0 && (
            <span
              className={cn(
                "font-mono font-bold",
                contribution.status === "published" && "text-amber-200",
                (contribution.status === "rejected" ||
                  contribution.status === "reverted") &&
                  "line-through",
              )}
            >
              +{contribution.points}
            </span>
          )}
          <time dateTime={date}>
            {format.dateTime(new Date(date), { dateStyle: "medium" })}
          </time>
        </span>
      </div>

      {contribution.changes && contribution.changes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("fields", {
            fields: contribution.changes
              .map((change) => change.field)
              .slice(0, 6)
              .join(", "),
          })}
        </p>
      )}

      {review && (review.reason || review.message) && (
        <p className="text-xs text-amber-50/90">
          {review.reason && <span>{tReasons(review.reason)}</span>}
          {review.reason && review.message && " · "}
          {review.message && <span>« {review.message} »</span>}
          {review.byName && (
            <span className="text-muted-foreground"> — {review.byName}</span>
          )}
        </p>
      )}

      {open && contribution.kind !== "media" && (
        <Link
          href={resumeHref(contribution)}
          className="inline-flex text-xs font-medium text-primary hover:underline"
        >
          {contribution.status === "changesRequested" ? t("fix") : t("resume")}
        </Link>
      )}
    </li>
  );
}
