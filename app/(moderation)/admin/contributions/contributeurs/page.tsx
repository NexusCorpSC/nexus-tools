import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { getContributor, listContributors } from "@/lib/gamification";
import { Button } from "@/components/ui/button";
import { LevelBadge } from "@/components/level-badge";
import { cn } from "@/lib/utils";
import { CONTRIBUTIONS_REVIEW_PERMISSION, LEVELS } from "@/types/contributions";
import { ModerationTabs } from "../moderation-tabs";
import { ContributorPanel } from "./contributor-panel";

export const metadata: Metadata = {
  title: "Admin — Contributeurs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Les contributeurs, par points : leur fiabilité, ce qu'on a retenu contre
 * leur contenu. La fiche d'un contributeur fixe son niveau, ajuste ses points,
 * l'avertit ou le suspend ; chaque décision va au journal de modération.
 */
export default async function ContributorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; compte?: string }>;
}) {
  if (!(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))) notFound();

  const { q, compte } = await searchParams;
  const [rows, detail, admin, session] = await Promise.all([
    listContributors(q),
    compte ? getContributor(compte) : null,
    isAdmin(),
    auth.api.getSession({ headers: await headers() }),
  ]);
  const t = await getTranslations("Contributions.People");
  const tLevels = await getTranslations("Contributions.levels");
  const tAdmin = await getTranslations("Contributions.Admin");
  const format = await getFormatter();
  const percent = (rate?: number) =>
    rate === undefined ? "—" : format.number(rate, { style: "percent" });
  const href = (id: string) => {
    const params = new URLSearchParams({ compte: id });
    if (q) params.set("q", q);
    return `/admin/contributions/contributeurs?${params}`;
  };

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-6xl space-y-6 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-6 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-8">
        <ModerationTabs current="people" />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#CCE7FF]">{t("title")}</h1>
            <p className="mt-1 text-[#9ED0FF]/70">{t("intro")}</p>
          </div>
          <form
            className="flex gap-2"
            action="/admin/contributions/contributeurs"
          >
            <input
              name="q"
              defaultValue={q}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <Button type="submit" size="sm" variant="outline" className="h-9">
              {t("searchSubmit")}
            </Button>
          </form>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[#F2F7FC]/60">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t("colName")}</th>
                    <th className="px-3 py-2 font-semibold">{t("colLevel")}</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      {t("colPoints")}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      {t("colPublished")}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      {t("colRate")}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      {t("colReports")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-[#9ED0FF]/8",
                        row.id === compte && "bg-[#9ED0FF]/8",
                      )}
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={href(row.id)}
                          scroll={false}
                          className="font-medium text-[#F2F7FC] hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.suspendedUntil && (
                          <span className="ml-2 text-xs text-[#F7D2AE]">
                            {t("suspendedUntil", {
                              date: new Date(row.suspendedUntil),
                            })}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <LevelBadge level={row.level} />
                          {row.trustLevel !== undefined && (
                            <span className="text-xs text-[#F2F7FC]/60">
                              {t("fixed")}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.points}
                      </td>
                      <td className="px-3 py-2 text-right">{row.published}</td>
                      <td className="px-3 py-2 text-right">
                        {percent(row.acceptanceRate)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right",
                          row.reportsAgainst > 0 && "text-[#F7D2AE]",
                        )}
                      >
                        {row.reportsAgainst}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[#F2F7FC]/60">{t("empty")}</p>
          )}

          {detail && (
            <section className="space-y-4 self-start rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75 p-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-[#F2F7FC]">
                  {t("detailTitle", { name: detail.row.name })}
                </h2>
                <p className="flex flex-wrap items-center gap-2 text-sm text-[#F2F7FC]/70">
                  <LevelBadge
                    level={detail.row.level}
                    name={tLevels(
                      LEVELS.find((entry) => entry.level === detail.row.level)!
                        .key,
                    )}
                  />
                  <span className="font-mono">{detail.row.points} pts</span>
                  <span>· {percent(detail.row.acceptanceRate)}</span>
                  <span>
                    · {detail.row.published} {t("colPublished").toLowerCase()}
                  </span>
                </p>
                {detail.row.suspendedUntil && (
                  <p className="text-sm text-[#F7D2AE]">
                    {t("suspendedUntil", {
                      date: new Date(detail.row.suspendedUntil),
                    })}
                  </p>
                )}
              </div>

              {session?.user?.id === detail.row.id ? (
                <p className="border-t border-[#9ED0FF]/15 pt-4 text-sm text-[#F7D2AE]">
                  {t("self")}
                </p>
              ) : (
                <ContributorPanel
                  key={detail.row.id}
                  id={detail.row.id}
                  canAdmin={admin}
                  trustLevel={detail.row.trustLevel}
                  suspended={Boolean(detail.row.suspendedUntil)}
                />
              )}

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
                  {t("warnings")}
                </h3>
                {detail.warnings.length > 0 ? (
                  <ul className="space-y-1 text-sm text-[#F2F7FC]/80">
                    {detail.warnings.map((warning) => (
                      <li key={warning.at}>
                        {format.dateTime(new Date(warning.at), {
                          dateStyle: "medium",
                        })}
                        {warning.note && ` · « ${warning.note} »`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#F2F7FC]/60">{t("noWarnings")}</p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
                  {t("ledger")}
                </h3>
                {detail.points.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {detail.points.map((line, index) => (
                      <li
                        key={`${line.at}-${index}`}
                        className="flex flex-wrap gap-x-2 text-[#F2F7FC]/80"
                      >
                        <span
                          className={cn(
                            "w-12 font-mono font-bold",
                            line.delta > 0 ? "text-[#F7D68F]" : "text-red-300",
                          )}
                        >
                          {line.delta > 0 ? `+${line.delta}` : line.delta}
                        </span>
                        <span>
                          {t.has(`reasons.${line.reason}`)
                            ? t(`reasons.${line.reason}` as "reasons.adjust")
                            : line.reason}
                          {line.note && ` · ${line.note}`}
                        </span>
                        <span className="ml-auto text-xs text-[#F2F7FC]/60">
                          {format.dateTime(new Date(line.at), {
                            dateStyle: "medium",
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#F2F7FC]/60">{t("noLedger")}</p>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-[#9ED0FF]/15 pt-4">
          <Button asChild variant="outline">
            <Link href="/admin">{tAdmin("backToAdmin")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
