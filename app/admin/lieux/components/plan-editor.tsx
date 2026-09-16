"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsPointingOutIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  LinkSlashIcon,
  MapPinIcon,
  PencilSquareIcon,
  PlusIcon,
  Square2StackIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { savePlacePlansAction } from "@/app/lieux/actions";
import { PlanMarker } from "@/app/lieux/plan-marker";
import { useImageViewport } from "@/app/lieux/use-image-viewport";
import {
  isDrawnPlan,
  PLACE_SERVICES,
  planImage,
  type DrawnPlacePlan,
  type PlacePlan,
  type StoredPlacePlan,
  type PlacePlanMarker,
  type PlaceService,
  type PlaceSummary,
} from "@/types/places";
import { PlanImageUpload } from "./place-image-upload";
import { DrawnPlanEditor } from "./drawn-plan-editor";
import { plateLegend, renderPreview } from "./drawn-plan-editor/export";
import { emptyDrawnPlan } from "./drawn-plan-editor/use-plan-draft";
import { PlacePicker } from "@/app/lieux/place-picker";
import { BorrowPlanDialog } from "./borrow-plan-dialog";

/** Quatre décimales, comme la normalisation côté serveur. */
const round4 = (value: number) => Number(value.toFixed(4));

export function PlanEditor({
  slug,
  placeName,
  initialPlans,
  initialTargets,
}: {
  slug: string;
  /** Le titre que porte une planche exportée : le lieu, pas le plan. */
  placeName: string;
  initialPlans: PlacePlan[];
  initialTargets: PlaceSummary[];
}) {
  const t = useTranslations("Places");
  const [isPending, startTransition] = useTransition();

  const [plans, setPlans] = useState<PlacePlan[]>(initialPlans);
  const [activeId, setActiveId] = useState<string | null>(
    initialPlans[0]?.id ?? null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"navigate" | "place">("navigate");
  const [dirty, setDirty] = useState(false);
  const [targets, setTargets] = useState<PlaceSummary[]>(initialTargets);

  const plan = plans.find((entry) => entry.id === activeId) ?? plans[0] ?? null;
  /** Le fond du plan ouvert, quelle que soit sa nature. */
  const image = plan ? planImage(plan) : null;
  const selected = plan?.markers.find((marker) => marker.id === selectedId);

  const {
    containerRef,
    imageRef,
    view,
    isPanning,
    zoomBy,
    reset,
    toNormalized,
    stageProps,
  } = useImageViewport({ enabled: mode === "navigate" });

  const dragging = useRef<string | null>(null);

  // Un départ de page avec des repères non enregistrés, c'est du travail perdu
  // sans avertissement : le navigateur demande confirmation.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const mutatePlan = useCallback(
    (planId: string, change: (entry: PlacePlan) => PlacePlan) => {
      setPlans((current) =>
        current.map((entry) => (entry.id === planId ? change(entry) : entry)),
      );
      setDirty(true);
    },
    [],
  );

  const mutateMarker = useCallback(
    (markerId: string, change: Partial<PlacePlanMarker>) => {
      if (!plan) return;
      mutatePlan(plan.id, (entry) => ({
        ...entry,
        markers: entry.markers.map((marker) =>
          marker.id === markerId ? { ...marker, ...change } : marker,
        ),
      }));
    },
    [mutatePlan, plan],
  );

  const addPlan = () => {
    const entry: PlacePlan = {
      id: nanoid(),
      name: `${t("Admin.planName")} ${plans.length + 1}`,
      imageUrl: "",
      imageWidth: 1600,
      imageHeight: 900,
      markers: [],
    };
    setPlans((current) => [...current, entry]);
    setActiveId(entry.id);
    setDirty(true);
  };

  /**
   * Un relevé dessiné plutôt qu'une image. C'est la réponse aux lieux dont
   * personne n'a jamais publié de carte : sans lui, la seule façon d'avoir un
   * plan était d'en trouver un ailleurs.
   */
  const addDrawnPlan = () => {
    const entry = emptyDrawnPlan(`${t("Admin.planName")} ${plans.length + 1}`);
    setPlans((current) => [...current, entry]);
    setActiveId(entry.id);
    setSelectedId(null);
    setDirty(true);
  };

  /**
   * Le plan ouvert quand c'est un relevé dessiné — emprunt compris. Le laisser
   * retomber sur la branche image montrerait un téléverseur vide à la place du
   * relevé du voisin ; il s'affiche donc, en lecture seule, comme le fait déjà
   * l'inspecteur de repères d'un plan emprunté.
   */
  const drawn: DrawnPlacePlan | null = plan && isDrawnPlan(plan) ? plan : null;

  const borrowPlan = (borrowed: PlacePlan) => {
    // L'identité locale est neuve : c'est elle que porte l'ancre `?plan=`, et
    // deux lieux qui empruntent le même plan ne doivent pas la partager.
    const entry: PlacePlan = { ...borrowed, id: nanoid() };
    setPlans((current) => [...current, entry]);
    setActiveId(entry.id);
    setDirty(true);
  };

  /**
   * Le plan devient celui du lieu. L'image reste celle de la source : le dépôt
   * ne supprime jamais un fichier de plan, donc la copie ne peut pas se
   * retrouver sans image le jour où la source retire le sien.
   */
  const detachPlan = (planId: string) => {
    setPlans((current) =>
      current.map((entry) =>
        entry.id === planId ? { ...entry, borrowedFrom: undefined } : entry,
      ),
    );
    setDirty(true);
  };

  const movePlan = (planId: string, delta: number) => {
    setPlans((current) => {
      const index = current.findIndex((entry) => entry.id === planId);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
    setDirty(true);
  };

  const removePlan = (planId: string) => {
    setPlans((current) => current.filter((entry) => entry.id !== planId));
    if (activeId === planId) setActiveId(null);
    setDirty(true);
  };

  const dropMarker = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "place" || !plan || !image || plan.borrowedFrom) return;
    const { x, y } = toNormalized(event.clientX, event.clientY);
    const marker: PlacePlanMarker = {
      id: nanoid(),
      x: round4(x),
      y: round4(y),
      service: "asop",
    };
    mutatePlan(plan.id, (entry) => ({
      ...entry,
      markers: [...entry.markers, marker],
    }));
    setSelectedId(marker.id);
  };

  /**
   * Dans l'éditeur, un plan qui porte `borrowedFrom` est un emprunt : on le
   * manipule comme un plan ordinaire — il s'affiche, il se réordonne — mais à
   * l'enregistrement il retrouve sa forme d'adresse.
   *
   * C'est tout le mécanisme du détachement : retirer `borrowedFrom` à un plan
   * suffit à en faire le sien, et le prochain enregistrement l'écrit en propre.
   * Sans cette conversion, le premier enregistrement recopierait chaque
   * emprunt, et la correction faite chez la source ne se propagerait plus.
   */
  const toStored = (entry: PlacePlan): StoredPlacePlan =>
    entry.borrowedFrom
      ? {
          id: entry.id,
          sourceSlug: entry.borrowedFrom.slug,
          sourcePlanId: entry.borrowedFrom.planId,
        }
      : entry;

  /** Ce que la planche d'un relevé porte en en-tête et en pied de page. */
  const plateOptions = useCallback(
    (entry: DrawnPlacePlan) => ({
      title: placeName,
      subtitle: entry.name,
      legend: plateLegend(entry, {
        door: t("Admin.glyphs.door"),
        doubleDoor: t("Admin.glyphs.doubleDoor"),
        airlock: t("Admin.glyphs.airlock"),
        stairUp: t("Admin.glyphs.stairUp"),
        stairDown: t("Admin.glyphs.stairDown"),
        objective: t("Admin.glyphs.objective"),
        terminal: t("Admin.glyphs.terminal"),
      }),
      credits: t("Admin.plateCredits"),
    }),
    [placeName, t],
  );

  const save = () => {
    startTransition(async () => {
      /*
       * Un relevé dessiné emporte son aperçu rastérisé. C'est lui que lisent
       * ceux qui ne savent pas dessiner une géométrie — l'overlay de nexus-app,
       * le fond d'un plan de vol — et le produire ici, au moment où le dessin
       * est complet, évite d'avoir à le régénérer à la lecture.
       */
      const rendered = await Promise.all(
        plans.map(async (entry) => {
          if (!isDrawnPlan(entry) || entry.borrowedFrom) return entry;
          try {
            const preview = await renderPreview(
              entry,
              slug,
              plateOptions(entry),
            );
            return { ...entry, preview };
          } catch {
            // L'aperçu est un confort ; le relevé, lui, doit être enregistré.
            toast.warning(t("Admin.previewFailed"));
            return entry;
          }
        }),
      );

      const result = await savePlacePlansAction(slug, rendered.map(toStored));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPlans(rendered);
      setDirty(false);
      toast.success(t("Admin.saved"));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 rounded-md border border-input p-0.5">
          {(["navigate", "place"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={mode === entry}
              onClick={() => setMode(entry)}
              className={`h-8 rounded px-3 text-sm font-medium transition-colors ${
                mode === entry
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {entry === "navigate"
                ? t("Admin.modeNavigate")
                : t("Admin.modePlace")}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-300">{t("Admin.unsaved")}</span>
          )}
          <Button onClick={save} disabled={isPending || !dirty}>
            {isPending ? t("Admin.saving") : t("Admin.save")}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("Admin.modeHint")}</p>

      <div
        className={`grid gap-4 ${
          drawn
            ? "lg:grid-cols-[220px_minmax(0,1fr)]"
            : "lg:grid-cols-[220px_minmax(0,1fr)_280px]"
        }`}
      >
        {/* ── Les plans du lieu ── */}
        <div className="space-y-2">
          {plans.map((entry, index) => (
            <div
              key={entry.id}
              className={`rounded-lg border p-2 transition-colors ${
                entry.id === plan?.id
                  ? "border-primary/50 bg-white/5"
                  : "border-[#9ED0FF]/15"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveId(entry.id);
                  setSelectedId(null);
                }}
                className="block w-full truncate text-left text-sm font-semibold"
              >
                {entry.name}
              </button>
              <p className="text-xs text-muted-foreground">
                {t("Admin.markerCount", { count: entry.markers.length })}
              </p>
              {entry.borrowedFrom && (
                <p className="flex items-center gap-1 text-xs text-[#9ED0FF]">
                  <Square2StackIcon className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {t("Admin.borrowedFrom", {
                      name: entry.borrowedFrom.name,
                    })}
                  </span>
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-1">
                {entry.borrowedFrom && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("Admin.detachPlan")}
                    title={t("Admin.detachPlan")}
                    onClick={() => detachPlan(entry.id)}
                  >
                    <LinkSlashIcon />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Admin.planMoveUp")}
                  disabled={index === 0}
                  onClick={() => movePlan(entry.id, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Admin.planMoveDown")}
                  disabled={index === plans.length - 1}
                  onClick={() => movePlan(entry.id, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Admin.planDelete")}
                  onClick={() => removePlan(entry.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <TrashIcon />
                </Button>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addPlan}
          >
            <PlusIcon className="size-4" />
            {t("Admin.planAdd")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addDrawnPlan}
          >
            <PencilSquareIcon className="size-4" />
            {t("Admin.planDraw")}
          </Button>

          <BorrowPlanDialog exclude={slug} onBorrow={borrowPlan} />
        </div>

        {drawn ? (
          <DrawnPlanEditor
            plan={drawn}
            slug={slug}
            plate={plateOptions(drawn)}
            readOnly={!!drawn.borrowedFrom}
            onChange={(next) => {
              setPlans((current) =>
                current.map((entry) => (entry.id === next.id ? next : entry)),
              );
              setDirty(true);
            }}
          />
        ) : (
          <>
            {/* ── Le plan lui-même ── */}
            <div className="space-y-2">
              {!plan ? (
                <p className="rounded-xl border border-dashed border-[#9ED0FF]/25 px-6 py-16 text-center text-sm text-muted-foreground">
                  {t("Admin.planNone")}
                </p>
              ) : !image ? (
                <div className="space-y-3 rounded-xl border border-dashed border-[#9ED0FF]/25 p-6">
                  <p className="text-sm text-muted-foreground">
                    {t("Admin.planNoImage")}
                  </p>
                  <PlanImageUpload
                    slug={slug}
                    planId={plan.id}
                    onChange={(value) =>
                      value &&
                      mutatePlan(plan.id, (entry) => ({
                        ...entry,
                        imageUrl: value.url,
                        imageWidth: value.width,
                        imageHeight: value.height,
                      }))
                    }
                  />
                </div>
              ) : (
                <div
                  ref={containerRef}
                  className="relative h-[480px] overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/45"
                >
                  <div
                    {...stageProps}
                    onPointerDown={(event) => {
                      dropMarker(event);
                      stageProps.onPointerDown(event);
                    }}
                    onPointerMove={(event) => {
                      if (dragging.current) {
                        const { x, y } = toNormalized(
                          event.clientX,
                          event.clientY,
                        );
                        mutateMarker(dragging.current, {
                          x: round4(x),
                          y: round4(y),
                        });
                        return;
                      }
                      stageProps.onPointerMove(event);
                    }}
                    onPointerUp={(event) => {
                      dragging.current = null;
                      stageProps.onPointerUp(event);
                    }}
                    onPointerCancel={(event) => {
                      dragging.current = null;
                      stageProps.onPointerCancel(event);
                    }}
                    className={`absolute inset-0 flex items-center justify-center ${
                      mode === "place"
                        ? "cursor-crosshair"
                        : isPanning
                          ? "cursor-grabbing"
                          : "cursor-grab"
                    }`}
                  >
                    <div
                      ref={imageRef}
                      className="relative max-h-full max-w-full"
                      style={{
                        aspectRatio: `${image.width} / ${image.height}`,
                        height: "100%",
                      }}
                    >
                      <Image
                        src={image.url}
                        alt={plan.name}
                        fill
                        sizes="960px"
                        className="select-none object-contain"
                        draggable={false}
                      />

                      {plan.markers.map((marker) => (
                        <PlanMarker
                          key={marker.id}
                          marker={marker}
                          target={targets.find(
                            (entry) => entry.slug === marker.targetSlug,
                          )}
                          scale={view.scale}
                          selected={marker.id === selectedId}
                          editable={!plan.borrowedFrom}
                          onSelect={() => {
                            if (!plan.borrowedFrom) setSelectedId(marker.id);
                          }}
                          onPointerDown={() => {
                            // Sur un plan emprunté, ni sélection ni glisser :
                            // l'inspecteur proposerait des modifications que
                            // l'enregistrement effacerait en silence, puisque le
                            // plan repart en référence.
                            if (plan.borrowedFrom) return;
                            dragging.current = marker.id;
                            setSelectedId(marker.id);
                          }}
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
                </div>
              )}

              {plan && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-name">{t("Admin.planName")}</Label>
                    <Input
                      id="plan-name"
                      value={plan.name}
                      disabled={!!plan.borrowedFrom}
                      onChange={(event) =>
                        mutatePlan(plan.id, (entry) => ({
                          ...entry,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-note">{t("Admin.planNote")}</Label>
                    <Input
                      id="plan-note"
                      value={plan.note ?? ""}
                      disabled={!!plan.borrowedFrom}
                      onChange={(event) =>
                        mutatePlan(plan.id, (entry) => ({
                          ...entry,
                          note: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Le repère choisi ── */}
            <div className="space-y-3 rounded-xl border border-[#9ED0FF]/15 p-3">
              <p className="text-sm font-semibold text-nexus-primary">
                {t("Admin.markerTitle")}
              </p>

              {plan?.borrowedFrom ? (
                <p className="text-xs text-muted-foreground">
                  {t("Admin.borrowedReadOnly", {
                    name: plan.borrowedFrom.name,
                  })}
                </p>
              ) : !selected ? (
                <p className="text-xs text-muted-foreground">
                  {t("Admin.markerNone")}
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-0.5 rounded-md border border-input p-0.5">
                    <button
                      type="button"
                      aria-pressed={!selected.targetSlug}
                      onClick={() =>
                        mutateMarker(selected.id, {
                          targetSlug: undefined,
                          service: selected.service ?? "asop",
                        })
                      }
                      className={`h-7 flex-1 rounded px-2 text-xs font-medium ${
                        !selected.targetSlug
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {t("Admin.markerKindService")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={!!selected.targetSlug}
                      onClick={() =>
                        mutateMarker(selected.id, { service: undefined })
                      }
                      className={`h-7 flex-1 rounded px-2 text-xs font-medium ${
                        selected.targetSlug
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {t("Admin.markerKindPlace")}
                    </button>
                  </div>

                  {!selected.targetSlug ? (
                    <div className="space-y-1.5">
                      <Label>{t("Admin.markerService")}</Label>
                      <Select
                        value={selected.service ?? "asop"}
                        onValueChange={(value) =>
                          mutateMarker(selected.id, {
                            service: value as PlaceService,
                            targetSlug: undefined,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLACE_SERVICES.map((service) => (
                            <SelectItem key={service} value={service}>
                              {t(`services.${service}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>{t("Admin.markerTarget")}</Label>
                      <PlacePicker
                        value={selected.targetSlug}
                        valueLabel={
                          targets.find(
                            (entry) => entry.slug === selected.targetSlug,
                          )?.name
                        }
                        exclude={slug}
                        onChange={(target) => {
                          mutateMarker(selected.id, {
                            targetSlug: target?.slug,
                            service: undefined,
                          });
                          // Le sélecteur rend la fiche entière : la pastille prend
                          // tout de suite son vrai type et son vrai nombre de
                          // plans, sans qu'on ait rien à deviner ni à attendre.
                          if (target) {
                            setTargets((current) =>
                              current.some(
                                (entry) => entry.slug === target.slug,
                              )
                                ? current
                                : [...current, target],
                            );
                          }
                        }}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="marker-label">
                      {t("Admin.markerLabel")}
                    </Label>
                    <Input
                      id="marker-label"
                      value={selected.label ?? ""}
                      onChange={(event) =>
                        mutateMarker(selected.id, { label: event.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("Admin.markerLabelHint")}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="marker-note">{t("Admin.markerNote")}</Label>
                    <Input
                      id="marker-note"
                      value={selected.note ?? ""}
                      onChange={(event) =>
                        mutateMarker(selected.id, { note: event.target.value })
                      }
                    />
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPinIcon className="size-3.5" />
                    {selected.x.toFixed(3)} · {selected.y.toFixed(3)}
                  </p>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-red-400"
                    onClick={() => {
                      if (!plan) return;
                      mutatePlan(plan.id, (entry) => ({
                        ...entry,
                        markers: entry.markers.filter(
                          (marker) => marker.id !== selected.id,
                        ),
                      }));
                      setSelectedId(null);
                    }}
                  >
                    <TrashIcon className="size-4" />
                    {t("Admin.markerDelete")}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
