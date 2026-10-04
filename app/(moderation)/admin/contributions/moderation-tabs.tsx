import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { countPendingContributions } from "@/lib/contributions";
import { countOpenReports } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * Les onglets de la modération : la file, les signalements, le journal, les
 * contributeurs.
 */
export async function ModerationTabs({
  current,
}: {
  current: "queue" | "reports" | "journal" | "people";
}) {
  const t = await getTranslations("Contributions.Admin");
  const tPeople = await getTranslations("Contributions.People");
  const [pending, reports] = await Promise.all([
    countPendingContributions(),
    countOpenReports(),
  ]);

  const tabs = [
    {
      key: "queue",
      href: "/admin/contributions",
      label: t("tabQueue"),
      count: pending,
      warn: false,
    },
    {
      key: "reports",
      href: "/admin/contributions/signalements",
      label: t("tabReports"),
      count: reports,
      warn: true,
    },
    {
      key: "journal",
      href: "/admin/contributions/journal",
      label: t("tabJournal"),
      count: 0,
      warn: false,
    },
    {
      key: "people",
      href: "/admin/contributions/contributeurs",
      label: tPeople("title"),
      count: 0,
      warn: false,
    },
  ] as const;

  return (
    <nav className="flex flex-wrap gap-1" aria-label={t("tabsLabel")}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors",
            tab.key === current
              ? "bg-[#123E60] text-[#F2F7FC]"
              : "text-[#F2F7FC]/70 hover:text-[#F2F7FC]",
          )}
        >
          {tab.label}
          {tab.count > 0 && (
            <span
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-bold",
                tab.warn
                  ? "bg-[#F2B880] text-[#2A1606]"
                  : "bg-[#9ED0FF] text-[#06233A]",
              )}
            >
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
