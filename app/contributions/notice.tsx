import { getTranslations } from "next-intl/server";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { Contribution, ContributorStanding } from "@/types/contributions";

/**
 * L'en-tête d'un formulaire de contribution : ce que le niveau du joueur
 * implique pour cet envoi, ce qu'il rapportera, et — quand il reprend une
 * contribution renvoyée à corriger — le message du relecteur.
 */
export async function ContributionNotice({
  standing,
  direct,
  points,
  resumed,
}: {
  standing: ContributorStanding;
  /** Le niveau publie-t-il cet envoi sans relecture préalable ? */
  direct: boolean;
  points?: number;
  resumed?: Contribution | null;
}) {
  const t = await getTranslations("Contributions.Form");
  const tLevels = await getTranslations("Contributions.levels");

  return (
    <div className="space-y-3">
      {resumed?.status === "changesRequested" && resumed.review?.message && (
        <div className="flex gap-3 rounded-xl border border-amber-300/40 bg-amber-300/10 p-4 text-sm">
          <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-200" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-100">
              {t("changesRequestedTitle")}
            </p>
            <p className="text-amber-50/90">
              « {resumed.review.message} »
              {resumed.review.byName && ` — ${resumed.review.byName}`}
            </p>
          </div>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-flex h-[18px] items-center rounded border border-amber-300/60 px-1.5 font-mono text-[10px] font-bold text-amber-200">
          N{standing.level}
        </span>
        <span>
          {direct
            ? t("levelDirect", { level: tLevels(standing.levelKey) })
            : t("levelReviewed", { level: tLevels(standing.levelKey) })}
        </span>
        {points !== undefined && points > 0 && (
          <span className="inline-flex items-center rounded-full border border-amber-300/55 bg-amber-300/15 px-2 font-mono text-[11px] font-bold leading-[18px] text-amber-200">
            +{points}
          </span>
        )}
      </p>
    </div>
  );
}
