import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LevelBadge } from "@/components/level-badge";
import { cn } from "@/lib/utils";
import type { Leaderboard } from "@/types/gamification";

/**
 * Les lignes d'un classement, et la place du lecteur quand il n'est pas parmi
 * les premiers. `limit` coupe la liste pour un encart.
 */
export async function LeaderboardList({
  board,
  limit,
  readerId,
}: {
  board: Leaderboard;
  limit?: number;
  readerId?: string;
}) {
  const t = await getTranslations("Contributions.Leaderboard");
  const entries = limit ? board.entries.slice(0, limit) : board.entries;
  const shown = entries.some((entry) => entry.id === readerId);

  if (board.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-1">
      <ol className="space-y-1">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              "flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-sm",
              entry.id === readerId && "bg-[#9ED0FF]/8",
            )}
          >
            <span className="w-6 shrink-0 font-mono text-xs font-bold text-muted-foreground">
              {entry.rank}
            </span>
            {board.scope === "orgs" && entry.image && (
              <Image
                src={entry.image}
                alt=""
                width={24}
                height={24}
                className="size-6 shrink-0 rounded object-cover"
              />
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                entry.id === readerId && "font-semibold",
              )}
            >
              {board.scope === "orgs" ? (
                <Link href={`/orgs/${entry.id}`} className="hover:underline">
                  {entry.name}
                  {entry.tag && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      [{entry.tag}]
                    </span>
                  )}
                </Link>
              ) : entry.id === readerId ? (
                t("you")
              ) : (
                entry.name
              )}
            </span>
            {entry.level !== undefined && <LevelBadge level={entry.level} />}
            {entry.members !== undefined && !limit && (
              <span className="text-xs text-muted-foreground">
                {t("members", { count: entry.members })}
              </span>
            )}
            <span className="font-mono text-[13px] font-bold text-[#F7D68F]">
              {entry.points}
            </span>
          </li>
        ))}
      </ol>

      {board.scope === "players" && board.me && !shown && (
        <>
          <div className="my-1 h-px bg-[#9ED0FF]/12" />
          {board.me.hidden ? (
            <p className="px-2 text-xs text-muted-foreground">
              {t("hidden")}{" "}
              <Link
                href="/settings#classement"
                className="text-primary hover:underline"
              >
                {t("show")}
              </Link>
            </p>
          ) : board.me.rank ? (
            <div className="flex min-h-9 items-center gap-2.5 rounded-lg bg-[#9ED0FF]/8 px-2 text-sm">
              <span className="w-6 shrink-0 font-mono text-xs font-bold text-muted-foreground">
                {board.me.rank}
              </span>
              <span className="flex-1 font-semibold">{t("you")}</span>
              <span className="font-mono text-[13px] font-bold text-[#F7D68F]">
                {board.me.points}
              </span>
            </div>
          ) : (
            <p className="px-2 text-xs text-muted-foreground">
              {t("unranked")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
