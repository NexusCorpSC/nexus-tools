"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { nanoid } from "nanoid";
import { PlanEditor } from "@/app/admin/lieux/components/plan-editor";
import { DrawnPlanWorkspace } from "@/app/admin/lieux/components/drawn-plan-workspace";
import { emptyDrawnPlan } from "@/app/admin/lieux/components/drawn-plan-editor/use-plan-draft";
import type { PlansSubmit } from "@/app/admin/lieux/components/save-plans";
import {
  ContributionMetaFields,
  useContribute,
  type ContributionMetaValue,
} from "@/app/contributions/contribute-kit";
import type { PlacePlan, PlaceSummary } from "@/types/places";

/**
 * Un plan proposé, dans l'éditeur de l'admin : un plan image avec ses repères
 * sur la page, un relevé dessiné sur la table à dessin plein écran.
 *
 * Chaque enregistrement part en contribution. Tant qu'elle attend sa
 * relecture, le suivant la reprend plutôt que d'en ouvrir une autre — c'est
 * le serveur qui la retrouve, par le plan qu'elle vise. Une fois le plan
 * publié, l'enregistrement suivant en propose une reprise.
 */
export function PlanContribution({
  slug,
  placeName,
  kind,
  plan: initialPlan,
  targets,
  source,
  gameVersion,
}: {
  slug: string;
  placeName: string;
  kind: "image" | "drawn";
  /** Absent pour un plan neuf, créé ici. */
  plan?: PlacePlan;
  targets: PlaceSummary[];
  source?: string;
  gameVersion?: string;
}) {
  const t = useTranslations("Contributions.Form");
  const tPlaces = useTranslations("Places");
  const router = useRouter();
  const { contribute, errorMessage } = useContribute();
  const [meta, setMeta] = useState<ContributionMetaValue>({
    source: source ?? "",
    gameVersion: gameVersion ?? "",
  });

  const [plan] = useState<PlacePlan>(
    () =>
      initialPlan ??
      (kind === "drawn"
        ? emptyDrawnPlan(tPlaces("Admin.planName"))
        : {
            id: nanoid(),
            name: tPlaces("Admin.planName"),
            imageUrl: "",
            imageWidth: 1600,
            imageHeight: 900,
            markers: [],
          }),
  );

  const submit: PlansSubmit = useCallback(
    async (plans) => {
      const result = await contribute(
        { kind: "plan", slug, plan: plans[0] },
        meta,
      );
      if (!result.ok) return { ok: false, error: errorMessage(result) };
      // L'adresse garde le plan : un rechargement rouvre la proposition en
      // cours, ou le plan publié, au lieu d'un plan vierge.
      if (!initialPlan) {
        router.replace(
          `/lieux/${slug}/contribuer/${kind === "drawn" ? "dessin" : "plan"}?plan=${plan.id}`,
          { scroll: false },
        );
      }
      return { ok: true };
    },
    [contribute, errorMessage, initialPlan, kind, meta, plan.id, router, slug],
  );

  if (kind === "drawn") {
    return (
      <DrawnPlanWorkspace
        slug={slug}
        placeName={placeName}
        planId={plan.id}
        initialPlans={[plan]}
        contribution={{
          submit,
          saveLabel: t("submit"),
          backHref: `/lieux/${slug}?onglet=plan`,
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PlanEditor
        slug={slug}
        placeName={placeName}
        initialPlans={[plan]}
        initialTargets={targets}
        contribution={{ submit, saveLabel: t("submit") }}
      />
      <ContributionMetaFields value={meta} onChange={setMeta} />
    </div>
  );
}
