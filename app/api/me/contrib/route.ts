import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getStanding } from "@/lib/contributions";
import { getAchievements, listContribEvents } from "@/lib/gamification";
import { locales, type Locale } from "@/i18n/config";
import { LEVELS } from "@/types/contributions";
import type { Achievement, ContribSummary } from "@/types/gamification";

/**
 * GET /api/me/contrib?since=<ISO>&locale=fr
 * Les points, le niveau et les succès débloqués du lecteur, et ce qui lui est
 * arrivé depuis `since` (contribution publiée ou à corriger, succès, montée de
 * niveau). L'app renvoie `now` comme prochain `since`. Sans `since`, les
 * évènements remontent à 24 heures.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const requested = params.get("locale");
  const locale: Locale = locales.includes(requested as Locale)
    ? (requested as Locale)
    : "fr";
  const rawSince = params.get("since");
  const since = rawSince ? new Date(rawSince) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Invalid since" }, { status: 400 });
  }

  const t = await getTranslations({ locale, namespace: "Contributions" });
  const levelName = (level: number) =>
    t(`levels.${LEVELS.find((entry) => entry.level === level)!.key}`);
  const achievementTitle = (achievement: Achievement) =>
    t(`Achievements.${achievement.key}.title`, {
      name: achievement.name ?? "",
      tier: achievement.tier ? t(`Achievements.tiers.${achievement.tier}`) : "",
    });

  const now = new Date();
  const userId = new ObjectId(session.user.id);
  const [standing, achievements, events] = await Promise.all([
    getStanding(userId),
    getAchievements(userId),
    listContribEvents(userId, since, {
      achievement: achievementTitle,
      level: (level) => `N${level} · ${levelName(level)}`,
    }),
  ]);
  const next = LEVELS.find(
    (entry) => entry.minPoints === standing.nextLevelPoints,
  );

  const body: ContribSummary = {
    points: standing.points,
    level: standing.level,
    levelKey: standing.levelKey,
    levelName: levelName(standing.level),
    nextLevelPoints: standing.nextLevelPoints,
    nextLevelName: next ? levelName(next.level) : undefined,
    acceptanceRate: standing.acceptanceRate,
    achievements: achievements
      .filter((achievement) => achievement.at)
      .map((achievement) => ({
        ...achievement,
        title: achievementTitle(achievement),
      })),
    events,
    now: now.toISOString(),
  };
  return NextResponse.json(body);
}
