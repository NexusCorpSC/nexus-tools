import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { hasPermission, isAdmin } from "@/lib/permissions";
import { getReportDetail, listOpenReports } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";
import {
  REPORT_ACTIONS_BY_TARGET,
  REPORT_MASK_WEIGHT,
  type Report,
  type ReportReason,
} from "@/types/reports";
import { ModerationTabs } from "../moderation-tabs";
import { ResolvePanel } from "./resolve-panel";

export const metadata: Metadata = {
  title: "Admin — Signalements",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Les motifs d'un dossier, du plus cité au moins cité. */
function reasonCounts(report: Report): [ReportReason, number][] {
  const counts = new Map<ReportReason, number>();
  for (const entry of report.entries) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Les dossiers ouverts, les plus lourds d'abord, et celui qu'on tranche : la
 * cible, ce qui l'a faite, ce qu'on lui reproche.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  if (!(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))) notFound();

  const { dossier } = await searchParams;
  const t = await getTranslations("Reports");
  const tMine = await getTranslations("Contributions.Mine");
  const { items, total } = await listOpenReports();
  const selectedId =
    items.find((item) => item.id === dossier)?.id ?? items[0]?.id;
  const detail = selectedId
    ? await getReportDetail(selectedId, await isAdmin())
    : null;

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-6xl space-y-6 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-6 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-8">
        <ModerationTabs current="reports" />

        <div>
          <h1 className="text-2xl font-bold text-[#CCE7FF]">
            {t("Admin.title")}
          </h1>
          <p className="mt-1 text-[#9ED0FF]/70">
            {total > 0
              ? t("Admin.header", { count: total })
              : t("Admin.headerEmpty")}
          </p>
        </div>

        {items.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ul className="space-y-2">
              {items.map((report) => (
                <li key={report.id}>
                  <Link
                    href={`/admin/contributions/signalements?dossier=${report.id}`}
                    aria-current={report.id === selectedId ? "true" : undefined}
                    className={cn(
                      "block space-y-1.5 rounded-xl border bg-[#092840]/75 px-4 py-3 transition-colors",
                      report.id === selectedId
                        ? "border-[#9ED0FF]"
                        : "border-[#9ED0FF]/14 hover:border-[#9ED0FF]/40",
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded-full border border-[#9ED0FF]/30 px-2 text-[11px] leading-[18px] text-[#BFE0FF]">
                        {t(`types.${report.target.type}`)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-[#F2F7FC]">
                        {report.target.name}
                      </span>
                      {report.hidden && (
                        <span className="rounded-full border border-[#F2B880]/55 px-2 text-[11px] leading-[18px] text-[#F7D2AE]">
                          {t("Admin.hidden")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#F2F7FC]/60">
                      <span className="h-1.5 flex-1 overflow-hidden rounded bg-[#9ED0FF]/14">
                        <i
                          className={cn(
                            "block h-full rounded",
                            report.weight >= REPORT_MASK_WEIGHT
                              ? "bg-[#F2B880]"
                              : "bg-[#9ED0FF]",
                          )}
                          style={{
                            width: `${Math.min(100, (report.weight / (REPORT_MASK_WEIGHT * 2)) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="font-mono">
                        {t("Admin.weight", { weight: report.weight })}
                      </span>
                      <span>
                        {t("Admin.reporters", { count: report.entries.length })}
                      </span>
                    </div>
                    <p className="text-xs text-[#F2F7FC]/60">
                      {reasonCounts(report)
                        .map(
                          ([reason, count]) =>
                            `${t(`reasons.${reason}.label`)}${count > 1 ? ` ×${count}` : ""}`,
                        )
                        .join(" · ")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>

            {detail && (
              <section className="space-y-5 rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75 p-5">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-[#F2F7FC]/60">
                    {t(`types.${detail.report.target.type}`)}
                  </p>
                  <h2 className="text-lg font-semibold text-[#F2F7FC]">
                    {detail.report.target.name}
                  </h2>
                  {detail.gone && (
                    <p className="text-sm text-[#F7D2AE]">{t("Admin.gone")}</p>
                  )}
                  {detail.report.target.imageUrl && (
                    <Image
                      src={detail.report.target.imageUrl}
                      alt={detail.report.target.name}
                      width={640}
                      height={360}
                      className="h-auto max-h-72 w-auto rounded-lg border border-[#9ED0FF]/15"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={detail.href} target="_blank">
                        {t("Admin.open")}
                      </Link>
                    </Button>
                    {detail.editHref && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={detail.editHref} target="_blank">
                          {t("Admin.edit")}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
                    {t("Admin.reasonsTitle")}
                  </h3>
                  <ul className="space-y-2">
                    {detail.report.entries.map((entry) => (
                      <li
                        key={`${entry.userId}-${entry.at}`}
                        className="rounded-lg border border-[#9ED0FF]/10 px-3 py-2 text-sm"
                      >
                        <p className="flex flex-wrap gap-x-2 text-[#F2F7FC]">
                          <span className="font-medium">
                            {t(`reasons.${entry.reason}.label`)}
                          </span>
                          <span className="text-[#F2F7FC]/60">
                            {t("Admin.entryBy", {
                              name: entry.userName ?? "?",
                              weight: entry.weight,
                              date: new Date(entry.at),
                            })}
                          </span>
                        </p>
                        {entry.comment && (
                          <p className="mt-1 whitespace-pre-line text-[#F2F7FC]/80">
                            {entry.comment}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
                    {t("Admin.historyTitle")}
                  </h3>
                  {detail.history.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {detail.history.map((contribution) => (
                        <li
                          key={contribution.id}
                          className="flex flex-wrap gap-x-2 text-[#F2F7FC]/80"
                        >
                          <span>{tMine(`kinds.${contribution.kind}`)}</span>
                          <span className="text-[#F2F7FC]/60">
                            {t("Admin.historyBy", {
                              name: contribution.userName ?? "?",
                              date: new Date(
                                contribution.publishedAt ??
                                  contribution.createdAt,
                              ),
                            })}
                          </span>
                          <span className="text-[#F2F7FC]/60">
                            {tMine(`statuses.${contribution.status}`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#F2F7FC]/60">
                      {t("Admin.noHistory")}
                    </p>
                  )}
                </div>

                <ResolvePanel
                  key={detail.report.id}
                  reportId={detail.report.id}
                  actions={[
                    ...REPORT_ACTIONS_BY_TARGET[detail.report.target.type],
                  ]}
                  gone={detail.gone}
                  history={detail.history
                    .filter(
                      (contribution) => contribution.status === "published",
                    )
                    .map((contribution) => ({
                      id: contribution.id,
                      label: `${tMine(`kinds.${contribution.kind}`)} · ${contribution.userName ?? "?"}`,
                    }))}
                  authors={detail.authors.map((author) => ({
                    id: author.id,
                    label: author.name ?? author.id,
                  }))}
                />
              </section>
            )}
          </div>
        )}

        <div className="border-t border-[#9ED0FF]/15 pt-4">
          <Button asChild variant="outline">
            <Link href="/admin">{t("Admin.backToAdmin")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
