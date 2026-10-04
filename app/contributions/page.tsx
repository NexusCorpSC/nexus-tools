import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { listMyContributions } from "@/lib/contributions";
import {
  countMyContributions,
  getAchievements,
  getLeaderboard,
} from "@/lib/gamification";
import {
  getReportingStanding,
  targetHref as reportTargetHref,
} from "@/lib/reports";
import { REPORT_UPHELD_POINTS, type ReportStatus } from "@/types/reports";
import { LeaderboardList } from "@/components/leaderboard-list";
import { cn } from "@/lib/utils";
import {
  CHANGES_REQUESTED_TTL_DAYS,
  LEVELS,
  MIN_ACCEPTANCE_RATE,
  levelForPoints,
  type Contribution,
  type ContributionStatus,
} from "@/types/contributions";
import type { Achievement, LeaderboardScope } from "@/types/gamification";
import { AchievementCard } from "./achievements";
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

/** Un succès débloqué depuis moins longtemps s'annonce en tête de page. */
const RECENT_ACHIEVEMENT_MS = 7 * 24 * 60 * 60 * 1000;

/** Le dernier succès débloqué, s'il date de moins d'une semaine. */
function latestUnlocked(sorted: Achievement[]): Achievement | undefined {
  const since = Date.now() - RECENT_ACHIEVEMENT_MS;
  return sorted.find(
    (entry) => entry.at && new Date(entry.at).getTime() > since,
  );
}

/** Débloqués d'abord, les plus récents en tête ; puis les plus avancés. */
function byProgress(a: Achievement, b: Achievement): number {
  if (a.at && b.at) return b.at.localeCompare(a.at);
  if (a.at || b.at) return a.at ? -1 : 1;
  const ratio = (entry: Achievement) =>
    entry.progress ? entry.progress.current / entry.progress.goal : 0;
  return ratio(b) - ratio(a);
}

/**
 * Ce que le joueur a apporté : son niveau et ce qui le sépare du suivant, ses
 * succès, ce qui attend, ce qu'on lui a renvoyé à corriger, ce qui a été
 * publié, refusé ou annulé ; et sa place au classement du mois.
 */
export default async function MyContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ classement?: string }>;
}) {
  const { classement } = await searchParams;
  const scope: LeaderboardScope = classement === "orgas" ? "orgs" : "players";
  const { userId, standing } = await requireContributor("/contributions");
  const [contributions, reporting, counts, achievements, board] =
    await Promise.all([
      listMyContributions(userId, 100),
      getReportingStanding(userId),
      countMyContributions(userId),
      getAchievements(userId),
      getLeaderboard("month", scope, userId),
    ]);
  const t = await getTranslations("Contributions.Mine");
  const tReports = await getTranslations("Reports");
  const tLevels = await getTranslations("Contributions.levels");
  const tAchievements = await getTranslations("Contributions.Achievements");
  const tBoard = await getTranslations("Contributions.Leaderboard");
  const format = await getFormatter();

  const toFix = contributions.filter(
    (entry) => entry.status === "changesRequested",
  );
  const others = contributions.filter(
    (entry) => entry.status !== "changesRequested",
  );

  const sorted = [...achievements].sort(byProgress);
  const unlocked = achievements.filter((entry) => entry.at).length;
  const recent = latestUnlocked(sorted);

  // Ce que le prochain niveau demande, et ce qu'il ouvre.
  const earned = levelForPoints(standing.points).level;
  const next = LEVELS.find((entry) => entry.level === earned + 1);
  const rate = format.number(MIN_ACCEPTANCE_RATE, { style: "percent" });
  // Comme sur la maquette : la part du chemin depuis zéro, pas depuis le palier.
  const progress = standing.nextLevelPoints
    ? Math.min(
        100,
        Math.round((standing.points / standing.nextLevelPoints) * 100),
      )
    : 100;
  const held = standing.level < earned;

  return (
    <div className="m-2 mx-auto max-w-6xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_560px] space-y-6">
          {recent && <AchievementCard achievement={recent} highlight />}

          <section className="flex flex-wrap items-center gap-5 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 p-4">
            <span className="flex size-[72px] shrink-0 items-center justify-center rounded-[18px] border-2 border-[#9ED0FF]/60">
              <b className="font-mono text-2xl font-bold text-[#CFE8FF]">
                N{standing.level}
              </b>
            </span>
            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <strong className="text-xl">
                  {tLevels(standing.levelKey)}
                </strong>
                <span className="font-mono text-[15px] font-bold text-[#F7D68F]">
                  {standing.nextLevelPoints
                    ? t("pointsOf", {
                        points: standing.points,
                        next: standing.nextLevelPoints,
                      })
                    : t("pointsOnly", { points: standing.points })}
                </span>
              </div>
              {standing.nextLevelPoints && (
                <span className="h-2 overflow-hidden rounded bg-[#9ED0FF]/14">
                  <i
                    className="block h-full rounded bg-[#9ED0FF]"
                    style={{ width: `${progress}%` }}
                  />
                </span>
              )}
              <p className="text-[13px] text-[#F2F7FC]/75">
                {held
                  ? t("rateHeld", { rate })
                  : next && standing.nextLevelPoints && standing.level < 5
                    ? [
                        t("nextLevel", {
                          name: tLevels(next.key),
                          points: standing.nextLevelPoints,
                          rate,
                        }),
                        standing.acceptanceRate !== undefined
                          ? t("yourRate", {
                              rate: format.number(standing.acceptanceRate, {
                                style: "percent",
                              }),
                            })
                          : "",
                        t(`unlocks.${next.level}` as "unlocks.2"),
                      ]
                        .filter(Boolean)
                        .join(" ")
                    : t("maxLevel")}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat
              value={counts.published}
              label={t("statPublished", { count: counts.published })}
            />
            <Stat value={counts.pending} label={t("statPending")} />
            <Stat value={counts.changesRequested} label={t("statToFix")} />
            <Stat
              value={counts.rejected}
              label={t("statRejected", { count: counts.rejected })}
            />
          </div>

          {(reporting.suspendedUntil ||
            reporting.bannedUntil ||
            reporting.warnings.length > 0) && (
            <section className="space-y-1.5 rounded-xl border border-amber-300/30 bg-amber-300/[0.07] px-4 py-3 text-sm text-amber-50/90">
              {reporting.suspendedUntil && (
                <p>
                  {tReports("Mine.suspended", {
                    date: new Date(reporting.suspendedUntil),
                  })}
                </p>
              )}
              {reporting.bannedUntil && (
                <p>
                  {tReports("Mine.banned", {
                    date: new Date(reporting.bannedUntil),
                  })}
                </p>
              )}
              {reporting.warnings.map((warning) => (
                <p key={warning.at}>
                  {tReports("Mine.warning", { date: new Date(warning.at) })}
                  {warning.note && ` « ${warning.note} »`}
                </p>
              ))}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-nexus-primary">
              {tAchievements("title", {
                done: unlocked,
                total: achievements.length,
              })}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {sorted.map((achievement) => (
                <AchievementCard
                  key={achievement.id}
                  achievement={achievement}
                />
              ))}
            </div>
          </section>

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
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-nexus-primary">
                {t("historyTitle")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t("historyHint")}
              </span>
            </div>
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

          {reporting.reports.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-nexus-primary">
                {tReports("Mine.title")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {tReports("Mine.hint", { points: REPORT_UPHELD_POINTS })}
              </p>
              <ul className="space-y-2">
                {reporting.reports.map((report) => (
                  <li
                    key={report.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 px-4 py-3 text-sm"
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-semibold",
                        REPORT_TONE[report.status],
                      )}
                    >
                      {tReports(`Mine.statuses.${report.status}`)}
                    </span>
                    <span className="text-muted-foreground">
                      {tReports(`reasons.${report.reason}.label`)}
                    </span>
                    <Link
                      href={reportTargetHref(report.target)}
                      className="font-medium text-nexus hover:underline"
                    >
                      {report.target.name}
                    </Link>
                    <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                      {report.status === "resolved" && (
                        <span className="font-mono font-bold text-amber-200">
                          +{REPORT_UPHELD_POINTS}
                        </span>
                      )}
                      <time dateTime={report.decidedAt ?? report.at}>
                        {format.dateTime(
                          new Date(report.decidedAt ?? report.at),
                          {
                            dateStyle: "medium",
                          },
                        )}
                      </time>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 max-w-[340px] flex-[1_1_280px] flex-col gap-4">
          <section
            aria-label={tBoard("title")}
            className="space-y-3 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {board.since
                  ? tBoard("titleMonth", { date: new Date(board.since) })
                  : tBoard("title")}
              </h2>
              <Link
                href={
                  scope === "orgs" ? "/classement?qui=orgas" : "/classement"
                }
                className="text-[13px] text-primary hover:underline"
              >
                {tBoard("full")}
              </Link>
            </div>
            <nav className="flex gap-1 rounded-[10px] bg-[#08243A] p-[3px]">
              {(["players", "orgs"] as const).map((key) => (
                <Link
                  key={key}
                  href={
                    key === "orgs"
                      ? "/contributions?classement=orgas"
                      : "/contributions"
                  }
                  scroll={false}
                  aria-current={key === scope ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 flex-1 items-center justify-center rounded-lg text-[13px] font-medium",
                    key === scope
                      ? "bg-[#123E60] text-[#F2F7FC]"
                      : "text-[#F2F7FC]/70 hover:text-[#F2F7FC]",
                  )}
                >
                  {tBoard(key)}
                </Link>
              ))}
            </nav>
            <LeaderboardList
              board={board}
              limit={3}
              readerId={String(userId)}
            />
            <p className="text-xs text-muted-foreground">
              {scope === "orgs" ? tBoard("hintOrgs") : tBoard("hintMonth")}
              {scope === "players" && !board.me?.hidden && (
                <>
                  {" "}
                  <Link
                    href="/settings#classement"
                    className="text-primary hover:underline"
                  >
                    {tBoard("hide")}
                  </Link>
                </>
              )}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-[#0B2E4A] px-3.5 py-3">
      <b className="font-mono text-[22px] font-bold">{value}</b>
      <span className="text-[13px] text-[#F2F7FC]/70">{label}</span>
    </div>
  );
}

const REPORT_TONE: Record<ReportStatus, string> = {
  open: "border-sky-300/40 text-sky-200",
  resolved: "border-emerald-300/40 text-emerald-200",
  dismissed: "border-red-300/40 text-red-200",
};

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
          {open && contribution.points > 0 ? (
            <span>{t("pointsOnPublish", { points: contribution.points })}</span>
          ) : (
            contribution.points !== 0 && (
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
            )
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
