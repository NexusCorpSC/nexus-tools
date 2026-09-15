"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { planApi, PlanHttpError } from "@/app/squads/plans/api";
import type { PlanSummary } from "@/types/plan";

/**
 * Prendre ce relevé pour fond d'un plan de vol.
 *
 * Le chemin court : on regarde le plan de Teasa Spaceport, on veut le briefer,
 * et la liste des plans de vol vient à nous plutôt que l'inverse. Le chemin
 * long — ouvrir le plan de vol, y chercher le lieu — existe aussi, dans la
 * fenêtre du plan ; les deux écrivent la même chose.
 *
 * On ne poste rien sans savoir : la liste dit du même souffle si l'appelant
 * commande, pour qu'aucun plan ne soit offert que la requête suivante
 * refuserait. Une session absente n'est pas une erreur non plus — c'est la
 * réponse « connectez-vous », et elle se dit sans bruit rouge.
 */
export function UseAsBackground({
  place,
  plan,
}: {
  place: { slug: string; name: string };
  /** Le relevé regardé : celui que le bouton propose de poser. */
  plan: { id: string; name: string };
}) {
  const t = useTranslations("Places");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title={t("useAsBackgroundHint")}
      >
        <PhotoIcon className="size-4" />
        <span className="hidden sm:inline">{t("useAsBackground")}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("useAsBackground")}</DialogTitle>
            <DialogDescription>
              {t("useAsBackgroundDescription", {
                place: place.name,
                plan: plan.name,
              })}
            </DialogDescription>
          </DialogHeader>

          {open ? (
            <PlanList place={place} plan={plan} onDone={() => setOpen(false)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Les plans de vol de l'escouade, et ce qui se dit quand il n'y en a pas.
 *
 * Monté à l'ouverture seulement : la fiche d'un lieu est publique, et demander
 * ses plans de vol à chaque visiteur qui passe par l'onglet Plan serait une
 * requête pour rien, refusée neuf fois sur dix.
 */
function PlanList({
  place,
  plan,
  onDone,
}: {
  place: { slug: string; name: string };
  plan: { id: string; name: string };
  onDone: () => void;
}) {
  const t = useTranslations("Places");
  const [state, setState] = useState<
    | { step: "loading" }
    | { step: "ready"; plans: PlanSummary[]; governs: boolean }
    | { step: "refused"; reason: "session" | "error" }
  >({ step: "loading" });
  const [sending, setSending] = useState<string | null>(null);

  // Ce composant ne vit que le temps du dialogue : une ouverture vaut une
  // lecture fraîche, et la fermeture l'emporte avec elle.
  useEffect(() => {
    let alive = true;

    void planApi
      .list(null)
      .then((view) => {
        if (!alive) return;
        setState({
          step: "ready",
          plans: view.feed.plans,
          governs: view.governs ?? false,
        });
      })
      .catch((error) => {
        if (!alive) return;
        setState({
          step: "refused",
          reason:
            error instanceof PlanHttpError && error.status === 401
              ? "session"
              : "error",
        });
      });

    return () => {
      alive = false;
    };
  }, []);

  async function apply(target: PlanSummary) {
    setSending(target.id);

    try {
      await planApi.update(target.id, null, {
        background: { place: { slug: place.slug, planId: plan.id } },
      });

      toast.success(t("backgroundSet", { plan: target.name }));
      onDone();
    } catch (error) {
      toast.error(t("backgroundFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSending(null);
    }
  }

  if (state.step === "loading") {
    return (
      <p className="text-sm text-muted-foreground">{t("backgroundLoading")}</p>
    );
  }

  if (state.step === "refused") {
    return (
      <p className="text-sm text-muted-foreground">
        {state.reason === "session"
          ? t("backgroundNoSession")
          : t("backgroundFailed")}
      </p>
    );
  }

  if (!state.governs) {
    return (
      <p className="text-sm text-muted-foreground">{t("backgroundNoRank")}</p>
    );
  }

  if (state.plans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("backgroundNoPlans")}</p>
    );
  }

  return (
    <ul className="space-y-1">
      {state.plans.map((target) => {
        // Déjà ce relevé-ci : dit plutôt que caché, pour que la liste reste la
        // liste des plans de vol et non un sous-ensemble qu'il faut deviner.
        const already =
          target.backgroundFrom?.placeSlug === place.slug &&
          target.backgroundFrom?.planId === plan.id;

        return (
          <li key={target.id}>
            <button
              type="button"
              disabled={already || sending !== null}
              onClick={() => void apply(target)}
              className="flex w-full items-center gap-2 rounded-md border border-input px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {target.name}
              </span>
              {already ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("backgroundAlready")}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
