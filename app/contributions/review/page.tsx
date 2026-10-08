import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PointsChip } from "@/components/points-chip";
import { listPendingContributions } from "@/lib/contributions";
import { hasPermission } from "@/lib/permissions";
import { requireContributor } from "@/app/contributions/session";
import { ReviewQueue } from "@/app/(moderation)/admin/contributions/review-queue";
import {
  CONTRIBUTIONS_REVIEW_PERMISSION,
  PLAYER_REVIEW_BATCH,
  POINTS,
  REVIEW_LEVEL,
} from "@/types/contributions";

export const metadata: Metadata = {
  title: "Relire les contributions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * La file de relecture, pour les Archivistes : la même que celle des
 * modérateurs, sans leurs propres contributions. Un modérateur qui relit ici
 * relit en joueur et gagne le point de relecture. Annuler une publication ou
 * traiter un signalement reste à la modération.
 */
export default async function ReviewPage() {
  const { userId, standing } = await requireContributor(
    "/contributions/review",
  );
  const moderator = await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION);
  if (
    !moderator &&
    (standing.suspendedUntil || standing.level < REVIEW_LEVEL)
  ) {
    notFound();
  }

  const t = await getTranslations("Contributions.Review");
  const tAdmin = await getTranslations("Contributions.Admin");
  // Ici, tout le monde relit en joueur, modérateurs compris : par lots de
  // `PLAYER_REVIEW_BATCH`, et la sélection ne dépasse jamais ce que l'action
  // accepte.
  const { items, total } = await listPendingContributions(
    PLAYER_REVIEW_BATCH,
    userId,
  );

  return (
    <div className="m-2 mx-auto max-w-6xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("intro")} <PointsChip points={POINTS.review} />
        </p>
        <p className="text-sm text-[#9ED0FF]/70">
          {total > 0
            ? tAdmin("header", { count: total })
            : tAdmin("headerEmpty")}
        </p>
        {total > 0 && (
          <p className="text-xs text-[#9ED0FF]/55">{tAdmin("shortcuts")}</p>
        )}
      </div>

      <ReviewQueue items={items} total={total} scope="archivist" />

      <div className="border-t border-[#9ED0FF]/15 pt-4">
        <Button asChild variant="outline">
          <Link href="/contributions">{t("back")}</Link>
        </Button>
      </div>
    </div>
  );
}
