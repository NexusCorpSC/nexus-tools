import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  JOURNAL_STATUSES,
  listJournal,
  type JournalStatus,
} from "@/lib/contributions";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  CONTRIBUTIONS_REVIEW_PERMISSION,
  CONTRIBUTION_KINDS,
  type ContributionKind,
} from "@/types/contributions";
import { JournalList } from "./journal-list";
import { ModerationTabs } from "../moderation-tabs";

export const metadata: Metadata = {
  title: "Admin — Journal des contributions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Filter = { statut?: string; type?: string; direct?: string };

function filterHref(current: Filter, change: Filter) {
  const next = { ...current, ...change };
  const params = new URLSearchParams(
    Object.entries(next).filter(([, value]) => value) as [string, string][],
  );
  const query = params.toString();
  return `/admin/contributions/journal${query ? `?${query}` : ""}`;
}

/**
 * Le journal : ce qui a été publié, renvoyé, refusé ou annulé. Les
 * publications directes des niveaux 3 et plus s'y relisent après coup, et
 * toute publication peut s'y annuler.
 */
export default async function ContributionsJournalPage({
  searchParams,
}: {
  searchParams: Promise<Filter>;
}) {
  if (!(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))) notFound();

  const filter = await searchParams;
  const status = JOURNAL_STATUSES.includes(filter.statut as JournalStatus)
    ? (filter.statut as JournalStatus)
    : undefined;
  const kind = CONTRIBUTION_KINDS.includes(filter.type as ContributionKind)
    ? (filter.type as ContributionKind)
    : undefined;
  const direct = filter.direct === "1";

  const t = await getTranslations("Contributions.Admin");
  const tMine = await getTranslations("Contributions.Mine");
  const entries = await listJournal({ status, kind, direct, limit: 150 });

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center rounded-md border px-3 text-sm",
      active
        ? "border-[#9ED0FF] bg-[#123E60] text-[#F2F7FC]"
        : "border-[#9ED0FF]/15 text-[#9ED0FF]/70 hover:text-[#CCE7FF]",
    );

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-6xl space-y-6 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-6 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-8">
        <ModerationTabs current="journal" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#CCE7FF]">
              {t("journalTitle")}
            </h1>
            <p className="mt-1 text-[#9ED0FF]/70">{t("journalHeader")}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={filterHref(filter, {
                statut: undefined,
                direct: undefined,
              })}
              className={chip(!status && !direct)}
            >
              {t("journalAll")}
            </Link>
            <Link
              href={filterHref(filter, { statut: undefined, direct: "1" })}
              className={chip(direct)}
            >
              {t("journalDirect")}
            </Link>
            {JOURNAL_STATUSES.map((entry) => (
              <Link
                key={entry}
                href={filterHref(filter, { statut: entry, direct: undefined })}
                className={chip(!direct && status === entry)}
              >
                {tMine(`statuses.${entry}`)}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={filterHref(filter, { type: undefined })}
              className={chip(!kind)}
            >
              {t("journalAllKinds")}
            </Link>
            {CONTRIBUTION_KINDS.map((entry) => (
              <Link
                key={entry}
                href={filterHref(filter, { type: entry })}
                className={chip(kind === entry)}
              >
                {t(`kinds.${entry}`)}
              </Link>
            ))}
          </div>
        </div>

        <JournalList entries={entries} />
      </div>
    </div>
  );
}
