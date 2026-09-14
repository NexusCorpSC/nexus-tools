"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  PlacePlan,
  PlacePlansResponse,
  PlaceSummary,
} from "@/types/places";
import { PlacePicker } from "./place-picker";

/**
 * Choisir le plan d'un autre lieu pour l'afficher ici. On ne propose que les
 * plans que ce lieu possède : emprunter un emprunt créerait une chaîne, et une
 * chaîne se casse au milieu sans qu'on sache où.
 *
 * Rien n'est écrit d'ici — le plan choisi rejoint l'état de l'éditeur, et part
 * avec le reste au prochain enregistrement. C'est ce qui permet d'annuler en
 * quittant la page, comme pour toute autre modification de plan.
 */
export function BorrowPlanDialog({
  exclude,
  onBorrow,
}: {
  /** Le lieu en cours d'édition : il possède déjà ses propres plans. */
  exclude: string;
  onBorrow: (plan: PlacePlan) => void;
}) {
  const t = useTranslations("Places.Admin");
  const [source, setSource] = useState<PlaceSummary | undefined>();
  const [fetched, setFetched] = useState<{
    slug: string;
    plans: PlacePlan[];
  } | null>(null);

  useEffect(() => {
    if (!source) return;

    // Comme `usePlaceSearch` : la réponse d'un lieu qu'on a cessé de regarder
    // ne doit pas venir remplir la liste d'un autre.
    const controller = new AbortController();
    const slug = source.slug;

    fetch(`/api/lieux/${slug}/plans`, { signal: controller.signal })
      .then((response) => response.json() as Promise<PlacePlansResponse>)
      .then((data) => {
        if (controller.signal.aborted) return;
        // Un emprunt ne s'emprunte pas : seuls les plans que ce lieu possède
        // sont proposés, ce qui interdit les chaînes à la source.
        setFetched({
          slug,
          plans: data.plans.filter((plan) => !plan.borrowedFrom),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFetched({ slug, plans: [] });
      });

    return () => controller.abort();
  }, [source]);

  // L'état affiché se déduit de « ce qui est là correspond-il à ce qui est
  // demandé ? », plutôt que d'un drapeau qu'un effet devrait remettre à zéro :
  // changer de lieu n'expose alors jamais la liste du précédent.
  const plans = source && fetched?.slug === source.slug ? fetched.plans : null;

  return (
    <div className="space-y-2 rounded-lg border border-[#9ED0FF]/15 p-2">
      <div className="space-y-1.5">
        <Label>{t("borrowPickPlace")}</Label>
        <PlacePicker
          value={source?.slug}
          valueLabel={source?.name}
          exclude={exclude}
          onChange={setSource}
          placeholder={t("borrowFromPlace")}
        />
      </div>

      {source && plans !== null && plans.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("borrowNoPlans")}</p>
      )}

      {plans !== null && plans.length > 0 && (
        <div className="space-y-1">
          <Label>{t("borrowPickPlan")}</Label>
          {plans.map((plan) => (
            <Button
              key={plan.id}
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                // `borrowedFrom` est ce qui fait de ce plan un emprunt une fois
                // de retour dans l'éditeur, et ce que l'enregistrement retourne
                // en adresse.
                onBorrow({
                  ...plan,
                  borrowedFrom: {
                    slug: source!.slug,
                    name: source!.name,
                    planId: plan.id,
                  },
                });
                setSource(undefined);
              }}
            >
              <span className="truncate">{plan.name}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
