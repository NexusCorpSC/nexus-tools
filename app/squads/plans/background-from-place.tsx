"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlacePicker } from "@/app/lieux/place-picker";
import type {
  PlacePlan,
  PlacePlansResponse,
  PlaceSummary,
} from "@/types/places";

/**
 * Prendre le relevé d'un lieu pour fond, depuis le plan de vol.
 *
 * L'autre chemin part de la fiche du lieu : on regarde un plan, on décide de
 * le briefer. Celui-ci part de l'inverse — le briefing est ouvert, il manque
 * le sol. C'est le même geste dans les deux sens, et la même écriture au bout.
 *
 * Deux temps, parce qu'un lieu peut avoir plusieurs relevés : le lieu, puis
 * lequel. Le second temps reste même quand il n'y a qu'un relevé — le sauter
 * demanderait de le choisir depuis un effet, qui repartirait à chaque rendu,
 * et ferait poser un fond sans qu'on ait rien vu de ce qu'on posait.
 *
 * Rien de l'image ne traverse le réseau : on ne renvoie que le lieu et le
 * relevé, et le serveur va chercher le reste. Une URL qu'on lui aurait donnée
 * serait une légende que personne n'a vérifiée, et c'est la légende que le
 * plan offre ensuite à cliquer.
 */
export function BackgroundFromPlace({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (choice: { slug: string; planId: string }) => void;
}) {
  const t = useTranslations("Plans");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        title={t("backgroundFromPlaceHint")}
        onClick={() => setOpen(true)}
      >
        <MapPin />
        <span className="hidden sm:inline">{t("backgroundFromPlace")}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("backgroundFromPlace")}</DialogTitle>
            <DialogDescription>
              {t("backgroundFromPlaceHint")}
            </DialogDescription>
          </DialogHeader>

          {open ? (
            <Chooser
              onPick={(choice) => {
                setOpen(false);
                onPick(choice);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Chooser({
  onPick,
}: {
  onPick: (choice: { slug: string; planId: string }) => void;
}) {
  const t = useTranslations("Plans");
  const [place, setPlace] = useState<PlaceSummary | undefined>();
  const [fetched, setFetched] = useState<{
    slug: string;
    plans: PlacePlan[];
  } | null>(null);

  useEffect(() => {
    if (!place) return;

    // Comme `usePlaceSearch` : la réponse d'un lieu qu'on a cessé de regarder
    // ne doit pas venir remplir la liste d'un autre.
    const controller = new AbortController();
    const slug = place.slug;

    fetch(`/api/lieux/${slug}/plans`, { signal: controller.signal })
      .then(async (response) => {
        // Un refus répond du JSON lui aussi. Sans ce garde, `{ error }` passe
        // pour une réponse valide, `plans` vaut `undefined`, et cela ne casse
        // qu'au rendu — loin d'ici, et sans rien qui dise pourquoi.
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as PlacePlansResponse;
        return Array.isArray(data.plans) ? data.plans : [];
      })
      .then((plans) => {
        if (controller.signal.aborted) return;
        setFetched({ slug, plans });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFetched({ slug, plans: [] });
      });

    return () => controller.abort();
  }, [place]);

  // Déduit plutôt que remis à zéro par un effet : changer de lieu n'expose
  // alors jamais, le temps d'une frame, les relevés du précédent.
  const plans = place && fetched?.slug === place.slug ? fetched.plans : null;

  return (
    <div className="space-y-3">
      <PlacePicker
        value={place?.slug}
        valueLabel={place?.name}
        onChange={setPlace}
        placeholder={t("backgroundPlaceSearch")}
      />

      {place && plans === null ? (
        <p className="text-xs text-muted-foreground">
          {t("backgroundLoading")}
        </p>
      ) : null}

      {plans !== null && plans.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("backgroundPlaceNoPlan")}
        </p>
      ) : null}

      {place && plans !== null && plans.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {plans.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => onPick({ slug: place.slug, planId: plan.id })}
                className="w-full overflow-hidden rounded-lg border border-input text-left transition-colors hover:border-nexus"
              >
                <span className="relative block aspect-video bg-[#092F49]/45">
                  <Image
                    src={plan.imageUrl}
                    alt=""
                    fill
                    sizes="240px"
                    className="object-contain"
                  />
                </span>
                <span className="block truncate px-2 py-1.5 text-sm font-medium">
                  {plan.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
