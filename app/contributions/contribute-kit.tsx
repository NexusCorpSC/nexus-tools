"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_GAME_VERSION_LENGTH,
  MAX_SOURCE_LENGTH,
} from "@/types/contributions";
import type {
  CatalogSubmission,
  CatalogSubmissionMeta,
} from "@/lib/contributions";
import { contributeAction, type ContributeResult } from "./actions";

/**
 * Ce que partagent tous les formulaires de contribution : la source et la
 * version du jeu en pied de formulaire, l'envoi, et ce qu'on dit ensuite.
 */

export type ContributionMetaValue = { source: string; gameVersion: string };

/** Les deux champs de fin que la spec donne à toute contribution. */
export function ContributionMetaFields({
  value,
  onChange,
}: {
  value: ContributionMetaValue;
  onChange: (value: ContributionMetaValue) => void;
}) {
  const t = useTranslations("Contributions.Form");

  return (
    <div className="grid gap-4 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 p-4 sm:grid-cols-[minmax(0,1fr)_160px]">
      <div className="space-y-1.5">
        <Label htmlFor="contribution-source">{t("source")}</Label>
        <Input
          id="contribution-source"
          value={value.source}
          maxLength={MAX_SOURCE_LENGTH}
          placeholder={t("sourcePlaceholder")}
          onChange={(event) =>
            onChange({ ...value, source: event.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">{t("sourceHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contribution-version">{t("gameVersion")}</Label>
        <Input
          id="contribution-version"
          value={value.gameVersion}
          maxLength={MAX_GAME_VERSION_LENGTH}
          placeholder="4.3"
          onChange={(event) =>
            onChange({ ...value, gameVersion: event.target.value })
          }
        />
      </div>
    </div>
  );
}

/**
 * Envoie une contribution et dit ce qu'il en est advenu : publiée avec ses
 * points, ou partie en relecture. Une erreur revient traduite, avec le message
 * de validation de la fiche quand il y en a un.
 */
export function useContribute() {
  const t = useTranslations("Contributions.Form");
  const tErrors = useTranslations("Contributions.errors");

  const errorMessage = useCallback(
    (result: Extract<ContributeResult, { ok: false }>) => {
      if (result.detail && result.error === "invalidInput")
        return result.detail;
      return tErrors.has(result.error)
        ? tErrors(result.error)
        : t("sendFailed");
    },
    [t, tErrors],
  );

  const contribute = useCallback(
    async (
      submission: CatalogSubmission,
      meta: CatalogSubmissionMeta,
    ): Promise<ContributeResult> => {
      let result: ContributeResult;
      try {
        result = await contributeAction(submission, meta);
      } catch {
        result = { ok: false, error: "applyFailed" };
      }
      if (!result.ok) return result;

      const { contribution } = result;
      if (contribution.status === "published") {
        toast.success(
          contribution.points > 0
            ? t("publishedWithPoints", { points: contribution.points })
            : t("published"),
        );
      } else {
        toast.success(t("sentForReview"));
      }
      return result;
    },
    [t],
  );

  return { contribute, errorMessage };
}
