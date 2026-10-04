import { getTranslations } from "next-intl/server";
import {
  BadgeCheck,
  Footprints,
  Globe,
  ImagePlus,
  Map as MapIcon,
  Shapes,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GUARDIAN_GOAL,
  PIONEER_TIERS,
  RELIABLE_GOAL,
  type Achievement,
  type AchievementKey,
} from "@/types/gamification";

const ICONS: Record<AchievementKey, LucideIcon> = {
  firstStep: Footprints,
  pioneer: ImagePlus,
  cartographer: MapIcon,
  tour: Globe,
  versatile: Shapes,
  guardian: ShieldCheck,
  reliable: BadgeCheck,
};

/** Le titre et la description d'un succès, dans la langue du lecteur. */
export async function achievementText(achievement: Achievement) {
  const t = await getTranslations("Contributions.Achievements");
  const goal =
    achievement.key === "pioneer"
      ? (PIONEER_TIERS.find((entry) => entry.tier === achievement.tier)?.goal ??
        1)
      : achievement.key === "guardian"
        ? GUARDIAN_GOAL
        : achievement.key === "reliable"
          ? RELIABLE_GOAL
          : (achievement.progress?.goal ?? 1);
  const values = {
    name: achievement.name ?? "",
    tier: achievement.tier ? t(`tiers.${achievement.tier}`) : "",
    goal,
  };
  return {
    title: t(`${achievement.key}.title`, values),
    description: t(`${achievement.key}.description`, values),
  };
}

/** Un succès : doré une fois débloqué, avec sa progression tant qu'il ne l'est pas. */
export async function AchievementCard({
  achievement,
  highlight = false,
}: {
  achievement: Achievement;
  highlight?: boolean;
}) {
  const t = await getTranslations("Contributions.Achievements");
  const { title, description } = await achievementText(achievement);
  const Icon = ICONS[achievement.key] ?? BadgeCheck;
  const done = Boolean(achievement.at);
  const progress = achievement.progress;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3",
        done ? "border-[#F5C46B]/45 bg-[#F5C46B]/6" : "border-[#9ED0FF]/14",
        highlight && "border-[#F5C46B]/55 p-4",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl",
          highlight ? "size-14" : "size-11",
          done
            ? "border border-[#F5C46B]/40 bg-[#F5C46B]/14 text-[#F7D68F]"
            : "bg-[#0E3352] text-[#F2F7FC]/40",
        )}
      >
        <Icon className={highlight ? "size-7" : "size-[22px]"} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {highlight && (
          <span className="text-xs font-semibold uppercase tracking-wide text-[#F7D68F]">
            {t("recent")}
          </span>
        )}
        <strong className={highlight ? "text-[17px]" : "text-[15px]"}>
          {title}
        </strong>
        <span className="text-[13px] text-[#F2F7FC]/70">
          {done && !highlight
            ? t("unlockedOn", { date: new Date(achievement.at!) })
            : description}
          {!done && progress && progress.goal > 1 && (
            <> · {t("progress", progress)}</>
          )}
        </span>
        {!done && progress && progress.goal > 1 && (
          <span className="h-1.5 overflow-hidden rounded bg-[#9ED0FF]/14">
            <i
              className="block h-full rounded bg-[#9ED0FF]"
              style={{
                width: `${Math.round((progress.current / progress.goal) * 100)}%`,
              }}
            />
          </span>
        )}
      </span>
    </div>
  );
}
