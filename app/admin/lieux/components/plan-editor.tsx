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
  MapPinIcon,
  PlusIcon,
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
  PLACE_SERVICES,
  type PlacePlan,
  type PlacePlanMarker,
  type PlaceService,
  type PlaceSummary,
} from "@/types/places";
import { PlanImageUpload } from "./place-image-upload";
import { PlacePicker } from "./place-picker";

/** Quatre décimales, comme la normalisation côté serveur. */
const round4 = (value: number) => Number(value.toFixed(4));

export function PlanEditor({
  slug,
  initialPlans,
  initialTargets,
}: {
  slug: string;
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
    if (mode !== "place" || !plan?.imageUrl) return;
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

  const save = () => {
    startTransition(async () => {
      const result = await savePlacePlansAction(slug, plans);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
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

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
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
              <div className="mt-1.5 flex items-center gap-1">
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
        </div>

        {/* ── Le plan lui-même ── */}
        <div className="space-y-2">
          {!plan ? (
            <p className="rounded-xl border border-dashed border-[#9ED0FF]/25 px-6 py-16 text-center text-sm text-muted-foreground">
              {t("Admin.planNone")}
            </p>
          ) : !plan.imageUrl ? (
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
                    const { x, y } = toNormalized(event.clientX, event.clientY);
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
                    aspectRatio: `${plan.imageWidth} / ${plan.imageHeight}`,
                    height: "100%",
                  }}
                >
                  <Image
                    src={plan.imageUrl}
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
                      editable
                      onSelect={() => setSelectedId(marker.id)}
                      onPointerDown={() => {
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

          {!selected ? (
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
                    onChange={(target, label) => {
                      mutateMarker(selected.id, {
                        targetSlug: target,
                        service: undefined,
                      });
                      // Le lieu visé vient d'être choisi : on le garde sous la
                      // main pour que la pastille prenne tout de suite son
                      // allure, sans attendre un aller-retour serveur.
                      if (target && label) {
                        setTargets((current) =>
                          current.some((entry) => entry.slug === target)
                            ? current
                            : [
                                ...current,
                                {
                                  slug: target,
                                  name: label,
                                  type: "building",
                                  id: target,
                                  depth: 0,
                                  childCount: 0,
                                  shopCount: 0,
                                  planCount: 1,
                                } as PlaceSummary,
                              ],
                        );
                      }
                    }}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="marker-label">{t("Admin.markerLabel")}</Label>
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
      </div>
    </div>
  );
}
