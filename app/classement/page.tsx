import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getLeaderboard } from "@/lib/gamification";
import { LeaderboardList } from "@/components/leaderboard-list";
import { cn } from "@/lib/utils";
import {
  isLeaderboardPeriod,
  isLeaderboardScope,
  type LeaderboardPeriod,
  type LeaderboardScope,
} from "@/types/gamification";

export const metadata: Metadata = {
  title: "Classement des contributeurs",
  description:
    "Les joueurs et les organisations qui enrichissent le catalogue de Nexus Tools : lieux, plans, images et objets.",
};

export const dynamic = "force-dynamic";

/** Le classement complet : joueurs ou organisations, du mois ou de toujours. */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; qui?: string }>;
}) {
  const { periode, qui } = await searchParams;
  const period: LeaderboardPeriod =
    periode === "tout"
      ? "all"
      : isLeaderboardPeriod(periode)
        ? periode
        : "month";
  const scope: LeaderboardScope =
    qui === "orgas" ? "orgs" : isLeaderboardScope(qui) ? qui : "players";

  const session = await auth.api.getSession({ headers: await headers() });
  const board = await getLeaderboard(
    period,
    scope,
    session?.user ? new ObjectId(session.user.id) : undefined,
  );
  const t = await getTranslations("Contributions.Leaderboard");

  const href = (next: {
    period?: LeaderboardPeriod;
    scope?: LeaderboardScope;
  }) => {
    const p = next.period ?? period;
    const s = next.scope ?? scope;
    const query = new URLSearchParams();
    if (p === "all") query.set("periode", "tout");
    if (s === "orgs") query.set("qui", "orgas");
    const text = query.toString();
    return text ? `/classement?${text}` : "/classement";
  };

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">
          {period === "month" && board.since
            ? t("titleMonth", { date: new Date(board.since) })
            : t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Segmented
          label={t("periodLabel")}
          options={[
            {
              key: "month",
              label: t("month"),
              href: href({ period: "month" }),
            },
            { key: "all", label: t("all"), href: href({ period: "all" }) },
          ]}
          current={period}
        />
        <Segmented
          label={t("scopeLabel")}
          options={[
            {
              key: "players",
              label: t("players"),
              href: href({ scope: "players" }),
            },
            { key: "orgs", label: t("orgs"), href: href({ scope: "orgs" }) },
          ]}
          current={scope}
        />
      </div>

      <LeaderboardList board={board} readerId={session?.user?.id} />

      <p className="text-xs text-muted-foreground">
        {scope === "orgs"
          ? t("hintOrgs")
          : period === "month"
            ? t("hintMonth")
            : t("hintAll")}
        {session?.user && scope === "players" && !board.me?.hidden && (
          <>
            {" "}
            <Link
              href="/settings#classement"
              className="text-primary hover:underline"
            >
              {t("hide")}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function Segmented({
  label,
  options,
  current,
}: {
  label: string;
  options: { key: string; label: string; href: string }[];
  current: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex gap-1 rounded-[10px] bg-[#08243A] p-[3px]"
    >
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          scroll={false}
          aria-current={option.key === current ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center rounded-lg px-3.5 text-[13px] font-medium",
            option.key === current
              ? "bg-[#123E60] text-[#F2F7FC]"
              : "text-[#F2F7FC]/70 hover:text-[#F2F7FC]",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
