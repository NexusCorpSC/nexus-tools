"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  isDrawnPlan,
  type DrawnPlacePlan,
  type PlacePlan,
} from "@/types/places";
import { DrawnPlanEditor } from "./drawn-plan-editor";
import { usePlanSaver } from "./save-plans";

/**
 * La coque plein écran de la table à dessin.
 *
 * `fixed inset-0` est délibéré, et il faut savoir pourquoi : dans l'App Router,
 * une mise en page imbriquée ne peut pas retirer la Topbar ni le Footer que
 * `app/layout.tsx` pose au-dessus d'elle. Recouvrir est la seule façon d'avoir
 * l'écran entier sans toucher à la coque globale — et c'est le comportement
 * attendu d'un éditeur immersif, dont on sort par « Retour ».
 *
 * Échap n'en sort pas : la touche appartient à l'éditeur, qui s'en sert pour
 * abandonner un tracé en cours et pour désélectionner. Quitter la page sur la
 * même touche qui annule un polygone ferait perdre le travail par accident.
 *
 * Le composant tient **tous** les plans du lieu, pas seulement celui qu'on
 * dessine : `savePlacePlans` les remplace en bloc, et n'en renvoyer qu'un
 * effacerait les autres.
 */
export function DrawnPlanWorkspace({
  slug,
  placeName,
  planId,
  initialPlans,
}: {
  slug: string;
  placeName: string;
  planId: string;
  initialPlans: PlacePlan[];
}) {
  const t = useTranslations("Places");
  const { plate, save } = usePlanSaver(slug, placeName);
  const [isPending, startTransition] = useTransition();

  const [plans, setPlans] = useState<PlacePlan[]>(initialPlans);
  const [dirty, setDirty] = useState(false);

  const entry = plans.find((item) => item.id === planId);
  const plan: DrawnPlacePlan | null =
    entry && isDrawnPlan(entry) ? entry : null;

  // Un départ de page avec un relevé non enregistré, c'est du travail perdu
  // sans avertissement : le navigateur demande confirmation.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // La route a vérifié que le plan existe et qu'il est dessiné ; ce garde-fou
  // ne sert qu'à satisfaire le typage après le premier rendu.
  if (!plan) return null;

  const plansHref = `/admin/lieux/${slug}/plans`;

  const commit = () => {
    startTransition(async () => {
      const result = await save(plans);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPlans(result.plans);
      setDirty(false);
      toast.success(t("Admin.saved"));
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0B3A5A] text-foreground">
      <header className="flex h-[52px] flex-shrink-0 items-center gap-4 border-b border-[#9ED0FF]/15 bg-[#0E4468] px-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={plansHref}>
            <ArrowLeftIcon className="size-4" />
            {t("Admin.drawnBack")}
          </Link>
        </Button>

        <div className="h-[22px] w-px bg-[#9ED0FF]/15" />

        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {placeName}
          </span>
          <span className="truncate text-sm font-semibold">{plan.name}</span>
          {dirty && (
            <span className="inline-flex h-[22px] flex-shrink-0 items-center gap-1.5 rounded bg-amber-400/15 px-2 text-[11px] font-medium text-amber-300">
              <ExclamationCircleIcon className="size-3" />
              {t("Admin.unsaved")}
            </span>
          )}
          {plan.borrowedFrom && (
            <span className="inline-flex h-[22px] flex-shrink-0 items-center rounded bg-white/10 px-2 text-[11px] font-medium text-muted-foreground">
              {t("Admin.drawnReadOnly")}
            </span>
          )}
        </div>

        <div className="flex-grow" />

        {!plan.borrowedFrom && (
          <Button onClick={commit} disabled={isPending || !dirty}>
            {isPending ? t("Admin.saving") : t("Admin.save")}
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1">
        <DrawnPlanEditor
          plan={plan}
          slug={slug}
          plate={plate(plan)}
          readOnly={!!plan.borrowedFrom}
          onChange={(next) => {
            setPlans((current) =>
              current.map((item) => (item.id === next.id ? next : item)),
            );
            setDirty(true);
          }}
        />
      </div>
    </div>
  );
}
