"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  ArrowsPointingOutIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import type { PlacePlansResponse, PlaceSummary } from "@/types/places";
import { markerName, markerTone, PlanMarker } from "@/app/lieux/plan-marker";
import { useImageViewport } from "@/app/lieux/use-image-viewport";

/**
 * Le visualiseur d'un plan, et la descente dans les lieux qu'il contient.
 *
 * Descendre est une navigation, pas un état local : l'adresse porte le lieu
 * regardé et le plan ouvert, donc le bouton Précédent remonte tout seul, un
 * lien se partage, et un rechargement retombe au même endroit. Le fil est
 * dérivé de la chaîne d'ancêtres — jamais empilé — ce qui le rend juste après
 * un Précédent comme après un rechargement.
 */
export function PlanViewer({
  data,
  rootSlug,
  activePlanId,
}: {
  data: PlacePlansResponse;
  /** Le lieu de la page : la descente ne sort jamais de son arborescence. */
  rootSlug: string;
  activePlanId?: string;
}) {
  const t = useTranslations("Places");
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const plan =
    data.plans.find((entry) => entry.id === activePlanId) ?? data.plans[0];
  const {
    containerRef,
    imageRef,
    view,
    isPanning,
    zoomBy,
    reset,
    stageProps,
    keyboardProps,
  } = useImageViewport();

  const targets = new Map<string, PlaceSummary>(
    data.targets.map((target) => [target.slug, target]),
  );

  const href = (lieu: string, planId?: string) => {
    const params = new URLSearchParams({ onglet: "plan" });
    if (lieu !== rootSlug) params.set("lieu", lieu);
    if (planId) params.set("plan", planId);
    return `/lieux/${rootSlug}?${params.toString()}`;
  };

  if (!plan) return null;

  const selected = plan.markers.find((marker) => marker.id === selectedId);
  const selectedTarget = selected?.targetSlug
    ? targets.get(selected.targetSlug)
    : undefined;

  // Du lieu de la page jusqu'à celui qu'on regarde : la partie de la chaîne
  // d'ancêtres qui vient après la racine, plus le lieu lui-même.
  const rootIndex = data.ancestors.findIndex(
    (ancestor) => ancestor.slug === rootSlug,
  );
  const trail = rootIndex >= 0 ? data.ancestors.slice(rootIndex) : [];
  const parent = trail.length > 0 ? trail[trail.length - 1] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {parent && (
            <Button
              asChild
              variant="outline"
              size="icon-sm"
              aria-label={t("planBack", { name: parent.name })}
            >
              <Link href={href(parent.slug)}>
                <ArrowLeftIcon className="size-4" />
              </Link>
            </Button>
          )}
          <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {trail.map((ancestor) => (
              <span key={ancestor.slug} className="flex items-center gap-1.5">
                <Link
                  href={href(ancestor.slug)}
                  className="underline underline-offset-2 hover:text-nexus"
                >
                  {ancestor.name}
                </Link>
                <span aria-hidden>›</span>
              </span>
            ))}
            <span className="font-semibold text-nexus">{data.name}</span>
          </nav>
        </div>

        {data.plans.length > 1 && (
          <div className="flex items-center gap-0.5 rounded-md border border-input p-0.5">
            {data.plans.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={entry.id === plan.id}
                // Remplacer plutôt qu'empiler : feuilleter les plans d'un même
                // lieu ne doit pas remplir l'historique.
                onClick={() =>
                  router.replace(href(data.slug, entry.id), { scroll: false })
                }
                className={`h-7 rounded px-2.5 text-sm font-medium transition-colors ${
                  entry.id === plan.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {entry.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        {...keyboardProps}
        tabIndex={0}
        role="group"
        aria-label={`${t("planTitle")} — ${data.name}`}
        className="relative h-[420px] overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-[560px]"
      >
        <div
          {...stageProps}
          className={`absolute inset-0 flex items-center justify-center ${
            isPanning ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          {/*
            La boîte porte le rapport d'aspect de l'image et l'image la remplit
            exactement : sans elle, `object-contain` laisserait des marges et
            « 50 % » désignerait le centre du cadre, pas celui de l'image — tous
            les repères dériveraient dès que les proportions diffèrent.
          */}
          <div
            ref={imageRef}
            className="relative max-h-full max-w-full"
            style={{
              aspectRatio: `${plan.imageWidth} / ${plan.imageHeight}`,
              height: "100%",
            }}
          >
            <Image
              src={plan.imageUrl}
              alt={`${t("planTitle")} — ${data.name}`}
              fill
              sizes="(max-width: 768px) 100vw, 960px"
              className="select-none object-contain"
              draggable={false}
              priority
            />

            {plan.markers.map((marker) => (
              <PlanMarker
                key={marker.id}
                marker={marker}
                target={
                  marker.targetSlug ? targets.get(marker.targetSlug) : undefined
                }
                scale={view.scale}
                selected={marker.id === selectedId}
                onSelect={() =>
                  setSelectedId((current) =>
                    current === marker.id ? null : marker.id,
                  )
                }
              />
            ))}
          </div>
        </div>

        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("planZoomIn")}
            onClick={() => zoomBy(1.2)}
          >
            <MagnifyingGlassPlusIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("planZoomOut")}
            onClick={() => zoomBy(1 / 1.2)}
          >
            <MagnifyingGlassMinusIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("planReset")}
            onClick={reset}
          >
            <ArrowsPointingOutIcon className="size-4" />
          </Button>
        </div>

        {plan.note && (
          <p className="absolute bottom-3 left-3 z-10 rounded-md border border-[#9ED0FF]/15 bg-[#0B3A5A]/80 px-2.5 py-1 text-xs text-nexus">
            {plan.note}
          </p>
        )}
      </div>

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {markerName(selected, selectedTarget, (service) =>
                t(`services.${service}`),
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {selected.note ??
                (selected.targetSlug ? t("markerPlace") : t("markerService"))}
            </p>
          </div>
          {selectedTarget && selectedTarget.planCount > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link href={href(selectedTarget.slug)}>
                {t("planEnter", { name: selectedTarget.name })}
              </Link>
            </Button>
          )}
        </div>
      )}

      {/*
        La liste des repères n'est pas un doublon de la carte : une disposition
        spatiale n'apprend rien à un lecteur d'écran, cette liste si.
      */}
      <div>
        <p className="mb-2 text-sm font-semibold text-nexus-primary">
          {t("planLegendTitle")}
        </p>
        <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {plan.markers.map((marker) => {
            const target = marker.targetSlug
              ? targets.get(marker.targetSlug)
              : undefined;
            const tone = markerTone(marker, target);
            const name = markerName(marker, target, (service) =>
              t(`services.${service}`),
            );
            const dot = {
              service: "bg-[#9ED0FF]",
              shop: "bg-[#F0C193]",
              place: "border border-[#C2E2FF]",
              unmapped: "border border-[#8FB6D6]",
            }[tone];

            return (
              <li key={marker.id} className="flex items-center gap-2 text-sm">
                <span className={`size-2.5 shrink-0 rounded-full ${dot}`} />
                {target && target.planCount > 0 ? (
                  <Link
                    href={href(target.slug)}
                    className="truncate text-nexus hover:text-white"
                  >
                    {name}
                  </Link>
                ) : (
                  <span className="truncate text-nexus">{name}</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("planLegendHint")}
        </p>
      </div>
    </div>
  );
}
