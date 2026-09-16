"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowsPointingOutIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { downloadPlatePng } from "@/lib/plan-export";
import {
  plateOptions,
  renderLevelSvg,
  renderPlateSvg,
} from "@/lib/plan-render";
import {
  isDrawnPlan,
  planImage,
  toPlaceSlug,
  type PlacePlansResponse,
  type PlaceSummary,
} from "@/types/places";
import { markerName, markerTone, PlanMarker } from "@/app/lieux/plan-marker";
import { useImageViewport } from "@/app/lieux/use-image-viewport";
import { UseAsBackground } from "./use-as-background";

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
  canBrief = false,
}: {
  data: PlacePlansResponse;
  /** Le lieu de la page : la descente ne sort jamais de son arborescence. */
  rootSlug: string;
  activePlanId?: string;
  /**
   * Y a-t-il quelqu'un de connecté ? Un relevé se pose en fond d'un plan de
   * vol, et un plan de vol appartient à une escouade — la fiche, elle, est
   * publique. Le bouton ne s'affiche donc pas pour un visiteur de passage,
   * plutôt que de s'afficher pour lui dire non.
   */
  canBrief?: boolean;
}) {
  const t = useTranslations("Places");
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  /**
   * Ce qu'on regarde : le plan qu'on parcourt, ou la planche qu'on emporte.
   *
   * Les deux montrent le même relevé, par le même moteur. La planche y ajoute
   * ce qu'un document doit porter pour vivre hors du site — titre, niveaux
   * côte à côte, légende, échelle, mentions — et retire ce qui n'a de sens
   * qu'ici : le zoom, les repères cliquables, la descente dans les lieux.
   */
  const [mode, setMode] = useState<"plan" | "plate">("plan");
  const [exporting, setExporting] = useState(false);

  const plan =
    data.plans.find((entry) => entry.id === activePlanId) ?? data.plans[0];
  const drawn = plan && isDrawnPlan(plan) ? plan : null;

  /**
   * Le fond, quand il y en a un — c'est-à-dire pour un plan **image** seulement.
   *
   * Un relevé dessiné n'en a pas ici : il se dessine en vecteurs juste en
   * dessous, et poser son aperçu rastérisé par-dessus le montrerait deux fois.
   * C'est ce qui arrivait, et qui restait invisible tant que cet aperçu était
   * celui d'un relevé vide — un cadre sans géométrie ne double rien.
   *
   * L'aperçu garde son emploi : il est ce que lisent les écrans qui ne savent
   * pas dessiner une géométrie, l'overlay de `nexus-app` et le fond d'un plan
   * de vol, qui le prennent directement sur le plan.
   */
  const image = plan && !drawn ? planImage(plan) : null;
  /**
   * Les proportions du cadre : celles de l'image, ou celles de l'emprise pour un
   * relevé dessiné. Les repères étant des fractions, c'est ce rapport qui décide
   * où ils tombent — le fausser les décale tous d'un coup.
   *
   * Et il était faussé : pour un relevé dessiné, le cadre prenait les
   * proportions de l'aperçu, qui sont celles d'une **planche** — en-tête,
   * légende et marges comprises — et non celles de l'emprise. Tous les repères
   * tombaient donc à côté.
   */
  const frame = image
    ? { width: image.width, height: image.height }
    : drawn
      ? { width: drawn.widthCm, height: drawn.heightCm }
      : { width: 16, height: 9 };

  /**
   * Le niveau regardé. On retombe sur le premier plutôt que sur rien quand
   * l'identifiant gardé en état vient du plan d'avant : changer de plan ne doit
   * pas vider le cadre.
   */
  const level = drawn
    ? (drawn.levels.find((entry) => entry.id === levelId) ?? drawn.levels[0])
    : null;

  /**
   * Un relevé dessiné est rendu en vecteurs, pas depuis son aperçu rastérisé :
   * il reste net à douze fois le zoom, et il s'affiche même quand le rendu qui
   * sert aux autres écrans n'a pas encore abouti.
   */
  const levelSvg = drawn && level ? renderLevelSvg(drawn, level) : null;

  /** L'habillage de la planche, le même que celui du PNG et de la page partagée. */
  const plate = drawn
    ? plateOptions(drawn, {
        placeName: data.name,
        glyphs: {
          door: t("Admin.glyphs.door"),
          doubleDoor: t("Admin.glyphs.doubleDoor"),
          airlock: t("Admin.glyphs.airlock"),
          stairUp: t("Admin.glyphs.stairUp"),
          stairDown: t("Admin.glyphs.stairDown"),
          objective: t("Admin.glyphs.objective"),
          terminal: t("Admin.glyphs.terminal"),
        },
        credits: t("Admin.plateCredits"),
      })
    : null;
  /*
   * La planche est dessinée ici, pas reprise de l'aperçu stocké : elle suit le
   * relevé au caractère près, y compris entre deux enregistrements, et elle
   * reste nette à n'importe quel agrandissement.
   */
  /*
   * La planche à l'écran, ou rien — et c'est la seule vérité sur ce qu'on
   * regarde. Le mode seul ne suffisait pas à le dire : il survit au changement
   * de plan, et un plan image n'a pas de planche. S'en remettre à lui laissait
   * le panneau d'un repère caché sans retour possible, la bascule ayant
   * disparu en même temps que le relevé dessiné.
   *
   * La replier ici évite au passage de composer une planche que personne ne
   * regarde, à chaque rendu.
   */
  const plateSvg =
    mode === "plate" && drawn && plate ? renderPlateSvg(drawn, plate) : null;

  /**
   * Les repères de l'étage regardé. Ceux d'un plan image n'ont pas de niveau et
   * passent tous — c'est ce qui laisse les relevés d'avant inchangés.
   */
  const markers = plan
    ? plan.markers.filter(
        (marker) => !level || !marker.levelId || marker.levelId === level.id,
      )
    : [];
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

        <div className="flex items-center gap-2">
          {/*
            La bascule n'a de sens que pour un relevé dessiné : un plan image
            *est* déjà son propre document, il n'y a pas de planche à en tirer.
          */}
          {drawn && (
            <div className="flex items-center gap-0.5 rounded-md border border-input p-0.5">
              {(["plan", "plate"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={mode === entry}
                  onClick={() => setMode(entry)}
                  className={`h-7 rounded px-2.5 text-sm font-medium transition-colors ${
                    mode === entry
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {t(entry === "plan" ? "planInteractive" : "planPlate")}
                </button>
              ))}
            </div>
          )}

          {drawn && mode === "plate" && (
            <Button
              size="sm"
              disabled={exporting}
              onClick={async () => {
                if (!plate) return;
                setExporting(true);
                try {
                  await downloadPlatePng(
                    drawn,
                    // Le nom du relevé est du texte libre : une barre oblique
                    // ou un deux-points en ferait un nom de fichier que le
                    // système refuse ou réécrit. On le passe par le même
                    // normalisateur que les adresses, et l'identifiant prend le
                    // relais si le nom se réduit à rien.
                    `${data.slug}-${toPlaceSlug(drawn.name) || drawn.id}.png`,
                    plate,
                  );
                } catch {
                  toast.error(t("planPlateFailed"));
                } finally {
                  setExporting(false);
                }
              }}
            >
              <ArrowDownTrayIcon className="size-4" />
              {exporting ? t("planPlateExporting") : t("planPlateDownload")}
            </Button>
          )}

          {/*
            Un relevé dessiné dont l'aperçu n'a pas abouti n'a pas d'image à
            poser en fond : la route du plan de vol répondrait 409. Mieux vaut
            ne rien proposer que proposer ce qui va échouer.
          */}
          {canBrief && (!drawn || drawn.preview) && (
            <UseAsBackground
              place={{ slug: data.slug, name: data.name }}
              plan={{ id: plan.id, name: plan.name }}
            />
          )}

          {drawn && drawn.levels.length > 1 && (
            <div className="flex items-center gap-0.5 rounded-md border border-input p-0.5">
              {drawn.levels.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={entry.id === level?.id}
                  onClick={() => {
                    setLevelId(entry.id);
                    setSelectedId(null);
                  }}
                  className={`h-7 rounded px-2.5 text-sm font-medium transition-colors ${
                    entry.id === level?.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          )}

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
      </div>

      {plateSvg ? (
        /*
          La planche se lit, elle ne se manipule pas : pas de zoom, pas de
          repères cliquables, pas de hauteur fixe. Elle prend la largeur
          disponible et se déroule, comme le ferait la feuille qu'elle imite.
        */
        <div
          role="img"
          aria-label={`${t("planPlate")} — ${data.name}`}
          className="overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#05192A] [&>svg]:h-auto [&>svg]:w-full"
          // Chaîne produite par `lib/plan-render.ts` à partir de données déjà
          // normalisées, et dont chaque texte passe par `esc()`.
          dangerouslySetInnerHTML={{ __html: plateSvg }}
        />
      ) : (
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
                aspectRatio: `${frame.width} / ${frame.height}`,
                height: "100%",
              }}
            >
              {image ? (
                <Image
                  src={image.url}
                  alt={`${t("planTitle")} — ${data.name}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 960px"
                  className="select-none object-contain"
                  draggable={false}
                  priority
                />
              ) : null}

              {levelSvg ? (
                <div
                  className="pointer-events-none absolute inset-0 [&>svg]:size-full"
                  // Chaîne produite par `lib/plan-render.ts` à partir de données
                  // déjà normalisées, et dont chaque texte passe par `esc()`.
                  dangerouslySetInnerHTML={{ __html: levelSvg }}
                />
              ) : null}

              {markers.map((marker) => (
                <PlanMarker
                  key={marker.id}
                  marker={marker}
                  target={
                    marker.targetSlug
                      ? targets.get(marker.targetSlug)
                      : undefined
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
      )}

      {/* Un repère sélectionné n'a pas de sens sur une planche : elle n'en a
          pas de cliquables. */}
      {!plateSvg && selected && (
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
