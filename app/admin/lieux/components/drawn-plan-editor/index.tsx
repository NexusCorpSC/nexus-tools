"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsPointingOutIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useImageViewport } from "@/app/lieux/use-image-viewport";
import { PLAN_THEME, type PlateOptions } from "@/lib/plan-render";
import { downloadPlatePng } from "./export";
import {
  ROOM_FILLS,
  ROOM_KINDS,
  type DrawnPlacePlan,
  type PlacePlanMarker,
  type PlanRoom,
  type RoomFill,
  type RoomKind,
} from "@/types/places";
import {
  PLAN_TOOLS,
  SNAP_CM,
  SNAP_DEG,
  snapTo,
  usePlanDraft,
  wrapDegrees,
  type PlanTool,
} from "./use-plan-draft";

/**
 * L'éditeur d'un relevé dessiné.
 *
 * Le dessin vit dans une couche transformée en CSS, et non dans un `<svg>`,
 * pour la raison que `use-image-viewport.ts` donne déjà : une pièce est alors un
 * vrai nœud du document, qui reçoit le pointeur, le focus et les mêmes styles
 * que le reste de l'administration. Le SVG, lui, sert au rendu — c'est
 * `lib/plan-render.ts` qui le fabrique, à partir des mêmes données.
 *
 * Les coordonnées manipulées ici sont **toujours des centimètres du relevé**.
 * La conversion depuis l'écran passe par `toNormalized`, qui mesure sur la boîte
 * du plan : rien à recalculer quand on zoome, rien à désynchroniser.
 */

/** La taille d'une porte posée d'un clic, en centimètres. */
const DOOR_CM = { w: 130, h: 40 };

/** En deçà, un glisser est un clic qui a tremblé, pas une pièce. */
const MIN_ROOM_CM = 50;

type Drag =
  | { kind: "draw"; tool: PlanTool; x: number; y: number }
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "resize"; id: string }
  | { kind: "rotate"; id: string; cx: number; cy: number }
  | null;

function fillStyle(fill: RoomFill): { background: string; border: string } {
  switch (fill) {
    case "mass":
      return { background: PLAN_THEME.mass, border: PLAN_THEME.wall };
    case "corridor":
      return { background: PLAN_THEME.corridor, border: PLAN_THEME.wall };
    case "objective":
      return {
        background: "rgba(242, 180, 65, 0.16)",
        border: PLAN_THEME.accent,
      };
    case "access":
      return {
        background: "rgba(79, 217, 138, 0.14)",
        border: PLAN_THEME.access,
      };
    case "none":
      return { background: "transparent", border: PLAN_THEME.wall };
    default:
      return { background: PLAN_THEME.room, border: PLAN_THEME.wall };
  }
}

/** Des centimètres en mètres, écrits comme le reste de l'interface. */
function metres(cm: number): string {
  return (cm / 100).toFixed(2).replace(".", ",");
}

export function DrawnPlanEditor({
  plan,
  slug,
  plate,
  onChange,
  readOnly = false,
}: {
  plan: DrawnPlacePlan;
  /** Le lieu à qui ce relevé appartient : il nomme le fichier exporté. */
  slug: string;
  /** L'habillage de la planche — titre, légende, mentions. */
  plate: Omit<PlateOptions, "fontCss">;
  onChange: (next: DrawnPlacePlan) => void;
  readOnly?: boolean;
}) {
  const t = useTranslations("Places");
  const draft = usePlanDraft(plan, onChange);
  const { level, tool, setTool, selection, setSelection, snap, angleSnap } =
    draft;

  /** Le rectangle qu'on est en train de tirer. Rien à voir avec `plan.preview`. */
  const [sketch, setSketch] = useState<PlanRoom | null>(null);
  const [exporting, setExporting] = useState(false);
  const drag = useRef<Drag>(null);

  const {
    containerRef,
    imageRef,
    view,
    isPanning,
    zoomBy,
    reset,
    toNormalized,
    stageProps,
    keyboardProps,
  } = useImageViewport({ enabled: tool === "select", minScale: 0.5 });

  /** Un point de l'écran, en centimètres du relevé. */
  const toCm = useCallback(
    (clientX: number, clientY: number) => {
      const fraction = toNormalized(clientX, clientY);
      return {
        x: fraction.x * plan.widthCm,
        y: fraction.y * plan.heightCm,
      };
    },
    [plan.heightCm, plan.widthCm, toNormalized],
  );

  const selectedRoom =
    selection?.kind === "room"
      ? (level?.rooms.find((room) => room.id === selection.id) ?? null)
      : null;
  const selectedMarker =
    selection?.kind === "marker"
      ? (plan.markers.find((marker) => marker.id === selection.id) ?? null)
      : null;

  // Supprimer ce qui est choisi, annuler, rétablir : les trois raccourcis qu'on
  // cherche sans y penser. Ils vivent sur le conteneur, qui a déjà le focus.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) draft.redo();
        else draft.undo();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection) {
          event.preventDefault();
          draft.removeSelected();
        }
        return;
      }
      if (event.key === "Escape") setSelection(null);
      keyboardProps.onKeyDown(event);
    },
    [draft, keyboardProps, readOnly, selection, setSelection],
  );

  /* ── Le geste sur la scène ───────────────────────────────────────────── */

  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;

    if (tool === "select") {
      // Cliquer le vide désélectionne : c'est ce que fait tout éditeur, et sans
      // ça l'inspecteur montre encore une pièce qu'on ne regarde plus.
      setSelection(null);
      stageProps.onPointerDown(event);
      return;
    }

    const point = toCm(event.clientX, event.clientY);
    const x = snapTo(point.x, SNAP_CM, snap);
    const y = snapTo(point.y, SNAP_CM, snap);

    if (tool === "door") {
      draft.addDoor({ kind: "single", x, y, ...DOOR_CM, rot: 0 });
      return;
    }
    if (tool === "label") {
      draft.addLabel({ text: t("Admin.planLabelNew"), x, y, rot: 0 });
      return;
    }
    if (tool === "marker") {
      const marker: PlacePlanMarker = {
        id: nanoid(),
        x: Number((point.x / plan.widthCm).toFixed(4)),
        y: Number((point.y / plan.heightCm).toFixed(4)),
        levelId: level?.id,
        service: "asop",
      };
      draft.apply((current) => ({
        ...current,
        markers: [...current.markers, marker],
      }));
      setSelection({ kind: "marker", id: marker.id });
      return;
    }

    // Les outils qui tirent un rectangle : pièce, mur, escalier.
    drag.current = { kind: "draw", tool, x, y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // Le même geste sert au fond de scène et aux deux poignées : le type de
  // l'élément suit, et seule la délégation au déplacement de vue le resserre.
  const onStagePointerMove = (event: React.PointerEvent<Element>) => {
    const current = drag.current;
    if (!current) {
      stageProps.onPointerMove(event as React.PointerEvent<HTMLDivElement>);
      return;
    }

    const point = toCm(event.clientX, event.clientY);

    if (current.kind === "draw") {
      const x = snapTo(point.x, SNAP_CM, snap);
      const y = snapTo(point.y, SNAP_CM, snap);
      setSketch({
        id: "sketch",
        name: "",
        kind: current.tool === "stair" ? "circulation" : "technical",
        x: Math.min(current.x, x),
        y: Math.min(current.y, y),
        w: Math.max(1, Math.abs(x - current.x)),
        h: Math.max(1, Math.abs(y - current.y)),
        rot: 0,
        fill: "plain",
        label: true,
      });
      return;
    }

    if (current.kind === "move") {
      draft.updateRoom(
        current.id,
        {
          x: snapTo(point.x - current.dx, SNAP_CM, snap),
          y: snapTo(point.y - current.dy, SNAP_CM, snap),
        },
        true,
      );
      return;
    }

    if (current.kind === "resize") {
      const room = level?.rooms.find((entry) => entry.id === current.id);
      if (!room) return;
      draft.updateRoom(
        current.id,
        {
          w: Math.max(MIN_ROOM_CM, snapTo(point.x - room.x, SNAP_CM, snap)),
          h: Math.max(MIN_ROOM_CM, snapTo(point.y - room.y, SNAP_CM, snap)),
        },
        true,
      );
      return;
    }

    if (current.kind === "rotate") {
      // L'angle du pointeur autour du centre de la pièce. Le quart de tour
      // d'écart vient de ce qu'une poignée se prend en haut, pas à droite.
      const angle =
        (Math.atan2(point.y - current.cy, point.x - current.cx) * 180) /
          Math.PI +
        90;
      draft.updateRoom(
        current.id,
        { rot: wrapDegrees(snapTo(angle, SNAP_DEG, angleSnap)) },
        true,
      );
    }
  };

  const onStagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;

    if (current?.kind === "draw" && sketch) {
      if (sketch.w >= MIN_ROOM_CM && sketch.h >= MIN_ROOM_CM) {
        draft.addRoom({
          name: "",
          kind: current.tool === "stair" ? "circulation" : "technical",
          x: sketch.x,
          y: sketch.y,
          w: sketch.w,
          h: sketch.h,
          rot: 0,
          fill: current.tool === "wall" ? "mass" : "plain",
          stair: current.tool === "stair" ? "up" : undefined,
          label: true,
        });
      }
      setSketch(null);
      setTool("select");
      return;
    }

    stageProps.onPointerUp(event);
  };

  /* ── Le dessin ───────────────────────────────────────────────────────── */

  const pct = (value: number, span: number) => `${(value / span) * 100}%`;

  const roomBox = (room: PlanRoom) => ({
    left: pct(room.x, plan.widthCm),
    top: pct(room.y, plan.heightCm),
    width: pct(room.w, plan.widthCm),
    height: pct(room.h, plan.heightCm),
    transform: room.rot ? `rotate(${room.rot}deg)` : undefined,
  });

  useEffect(() => {
    if (tool !== "select") setSelection(null);
  }, [setSelection, tool]);

  if (!level) return null;

  return (
    <div className="flex h-[640px] overflow-hidden rounded-xl border border-[#9ED0FF]/15">
      {/* ── Le rail d'outils ── */}
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[#9ED0FF]/15 bg-card py-2">
        {PLAN_TOOLS.map((entry) => (
          <button
            key={entry}
            type="button"
            title={t(`Admin.tool.${entry}`)}
            aria-label={t(`Admin.tool.${entry}`)}
            aria-pressed={tool === entry}
            disabled={readOnly}
            onClick={() => setTool(entry)}
            className={`flex size-9 items-center justify-center rounded-md text-[11px] font-semibold uppercase transition-colors disabled:opacity-40 ${
              tool === entry
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {t(`Admin.toolShort.${entry}`)}
          </button>
        ))}
        <div className="mt-2 h-px w-6 bg-[#9ED0FF]/15" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("Admin.undo")}
          disabled={readOnly || !draft.canUndo}
          onClick={draft.undo}
        >
          <ArrowUturnLeftIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("Admin.redo")}
          disabled={readOnly || !draft.canRedo}
          onClick={draft.redo}
        >
          <ArrowUturnRightIcon className="size-4" />
        </Button>
      </nav>

      {/* ── Les niveaux ── */}
      <aside className="w-44 shrink-0 overflow-y-auto border-r border-[#9ED0FF]/15 p-2">
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("Admin.levels")}
        </p>
        {plan.levels.map((entry, index) => (
          <div
            key={entry.id}
            className={`mb-1 rounded-md border p-1.5 transition-colors ${
              entry.id === level.id
                ? "border-primary/50 bg-white/5"
                : "border-transparent hover:bg-accent/40"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                draft.setLevelId(entry.id);
                setSelection(null);
              }}
              className="block w-full truncate text-left text-sm font-medium"
            >
              {entry.name || t("Admin.levelUnnamed")}
            </button>
            <p className="font-mono text-[10px] text-muted-foreground">
              {t("Admin.levelCount", { rooms: entry.rooms.length })}
            </p>
            {entry.id === level.id && !readOnly && (
              <div className="mt-1 flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Admin.planMoveUp")}
                  disabled={index === 0}
                  onClick={() => draft.moveLevel(entry.id, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Admin.planMoveDown")}
                  disabled={index === plan.levels.length - 1}
                  onClick={() => draft.moveLevel(entry.id, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("Admin.levelDelete")}
                  disabled={plan.levels.length <= 1}
                  onClick={() => draft.removeLevel(entry.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <TrashIcon />
                </Button>
              </div>
            )}
          </div>
        ))}
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={draft.addLevel}
          >
            <PlusIcon className="size-4" />
            {t("Admin.levelAdd")}
          </Button>
        )}
      </aside>

      {/* ── La scène ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div
          ref={containerRef}
          onKeyDown={onKeyDown}
          tabIndex={0}
          role="application"
          aria-label={t("Admin.stageLabel")}
          className="relative flex-1 overflow-hidden bg-[#061E2F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div
            {...stageProps}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            className={`absolute inset-0 flex items-center justify-center p-6 ${
              tool === "select"
                ? isPanning
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "cursor-crosshair"
            }`}
          >
            <div
              ref={imageRef}
              className="relative max-h-full max-w-full bg-[#04121D] ring-1 ring-[#9ED0FF]/20"
              style={{
                aspectRatio: `${plan.widthCm} / ${plan.heightCm}`,
                height: "100%",
              }}
            >
              {level.rooms.map((room) => {
                const paint = fillStyle(room.fill);
                const chosen =
                  selection?.kind === "room" && selection.id === room.id;
                return (
                  <div
                    key={room.id}
                    role="button"
                    tabIndex={-1}
                    aria-label={room.name || t("Admin.roomUnnamed")}
                    onPointerDown={(event) => {
                      if (readOnly || tool !== "select") return;
                      event.stopPropagation();
                      const point = toCm(event.clientX, event.clientY);
                      drag.current = {
                        kind: "move",
                        id: room.id,
                        dx: point.x - room.x,
                        dy: point.y - room.y,
                      };
                      setSelection({ kind: "room", id: room.id });
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={onStagePointerMove}
                    onPointerUp={(event) => {
                      drag.current = null;
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }}
                    className="absolute flex items-center justify-center overflow-hidden text-center"
                    style={{
                      ...roomBox(room),
                      background: paint.background,
                      outline: `2px solid ${chosen ? PLAN_THEME.fg : paint.border}`,
                      outlineOffset: "-2px",
                      boxShadow: chosen
                        ? "0 0 0 2px rgba(143, 203, 255, 0.55)"
                        : undefined,
                    }}
                  >
                    {room.label && room.name ? (
                      <span
                        className="pointer-events-none px-1 text-[10px] font-semibold uppercase leading-tight tracking-wide"
                        style={{ color: PLAN_THEME.fg }}
                      >
                        {room.name}
                      </span>
                    ) : null}
                  </div>
                );
              })}

              {level.doors.map((door) => (
                <div
                  key={door.id}
                  onPointerDown={(event) => {
                    if (readOnly || tool !== "select") return;
                    event.stopPropagation();
                    setSelection({ kind: "door", id: door.id });
                  }}
                  className="absolute"
                  style={{
                    left: pct(door.x, plan.widthCm),
                    top: pct(door.y, plan.heightCm),
                    width: pct(door.w, plan.widthCm),
                    height: pct(door.h, plan.heightCm),
                    transform: door.rot ? `rotate(${door.rot}deg)` : undefined,
                    background:
                      door.kind === "opening" ? "#061E2F" : PLAN_THEME.wall,
                    outline:
                      selection?.kind === "door" && selection.id === door.id
                        ? `2px solid ${PLAN_THEME.accent}`
                        : undefined,
                  }}
                />
              ))}

              {plan.markers
                .filter(
                  (marker) => !marker.levelId || marker.levelId === level.id,
                )
                .map((marker) => (
                  <button
                    key={marker.id}
                    type="button"
                    aria-label={
                      marker.label ?? marker.service ?? t("Admin.markerTitle")
                    }
                    onPointerDown={(event) => {
                      if (readOnly) return;
                      event.stopPropagation();
                      setSelection({ kind: "marker", id: marker.id });
                    }}
                    className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border"
                    style={{
                      left: `${marker.x * 100}%`,
                      top: `${marker.y * 100}%`,
                      borderColor: PLAN_THEME.accent,
                      background: "rgba(6, 30, 47, 0.9)",
                      boxShadow:
                        selection?.kind === "marker" &&
                        selection.id === marker.id
                          ? "0 0 0 2px rgba(143, 203, 255, 0.55)"
                          : undefined,
                    }}
                  />
                ))}

              {sketch ? (
                <div
                  className="pointer-events-none absolute border-2 border-dashed"
                  style={{
                    ...roomBox(sketch),
                    borderColor: PLAN_THEME.accent,
                    background: "rgba(242, 180, 65, 0.1)",
                  }}
                />
              ) : null}

              {/* La poignée de rotation et celle de taille, sur la pièce choisie. */}
              {selectedRoom && !readOnly ? (
                <div
                  className="pointer-events-none absolute"
                  style={roomBox(selectedRoom)}
                >
                  <button
                    type="button"
                    aria-label={t("Admin.rotate")}
                    className="pointer-events-auto absolute -top-6 left-1/2 size-3.5 -translate-x-1/2 cursor-grab rounded-full border-2 bg-[#061E2F]"
                    style={{ borderColor: PLAN_THEME.fg }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      drag.current = {
                        kind: "rotate",
                        id: selectedRoom.id,
                        cx: selectedRoom.x + selectedRoom.w / 2,
                        cy: selectedRoom.y + selectedRoom.h / 2,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={onStagePointerMove}
                    onPointerUp={(event) => {
                      drag.current = null;
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }}
                  />
                  <button
                    type="button"
                    aria-label={t("Admin.resize")}
                    className="pointer-events-auto absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border"
                    style={{
                      borderColor: PLAN_THEME.fg,
                      background: PLAN_THEME.fg,
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      drag.current = { kind: "resize", id: selectedRoom.id };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={onStagePointerMove}
                    onPointerUp={(event) => {
                      drag.current = null;
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }}
                  />
                </div>
              ) : null}
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

        {/* ── La barre d'état ── */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-t border-[#9ED0FF]/15 bg-card px-2 text-[11px] text-muted-foreground">
          <button
            type="button"
            aria-pressed={snap}
            onClick={() => draft.setSnap(!snap)}
            className={`h-6 rounded border px-2 ${snap ? "border-[#9ED0FF]/40 bg-white/10 text-foreground" : "border-[#9ED0FF]/15"}`}
          >
            {t("Admin.snapCm", { step: SNAP_CM })}
          </button>
          <button
            type="button"
            aria-pressed={angleSnap}
            onClick={() => draft.setAngleSnap(!angleSnap)}
            className={`h-6 rounded border px-2 ${angleSnap ? "border-[#9ED0FF]/40 bg-white/10 text-foreground" : "border-[#9ED0FF]/15"}`}
          >
            {t("Admin.snapAngle", { step: SNAP_DEG })}
          </button>
          <span className="font-mono">{level.name}</span>
          <span className="grow" />
          <span className="font-mono">
            {t("Admin.extent", {
              width: metres(plan.widthCm),
              height: metres(plan.heightCm),
            })}
          </span>
          <span className="font-mono">{Math.round(view.scale * 100)} %</span>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await downloadPlatePng(plan, `${slug}-${plan.id}.png`, plate);
              } catch {
                toast.error(t("Admin.exportFailed"));
              } finally {
                setExporting(false);
              }
            }}
            className="h-6 rounded border border-[#9ED0FF]/15 px-2 hover:bg-accent disabled:opacity-50"
          >
            {exporting ? t("Admin.exporting") : t("Admin.exportPng")}
          </button>
        </div>
      </main>

      {/* ── L'inspecteur ── */}
      <aside className="w-64 shrink-0 space-y-3 overflow-y-auto border-l border-[#9ED0FF]/15 p-3">
        {selectedRoom ? (
          <RoomInspector
            room={selectedRoom}
            readOnly={readOnly}
            onPatch={(patch) => draft.updateRoom(selectedRoom.id, patch)}
            onDelete={draft.removeSelected}
          />
        ) : selectedMarker ? (
          <MarkerInspector
            marker={selectedMarker}
            readOnly={readOnly}
            onPatch={(patch) =>
              draft.apply((current) => ({
                ...current,
                markers: current.markers.map((entry) =>
                  entry.id === selectedMarker.id
                    ? { ...entry, ...patch }
                    : entry,
                ),
              }))
            }
            onDelete={draft.removeSelected}
          />
        ) : (
          <PlanInspector
            plan={plan}
            readOnly={readOnly}
            onPatch={(patch) =>
              draft.apply((current) => ({ ...current, ...patch }))
            }
            onRenameLevel={(name) => draft.renameLevel(level.id, name)}
            levelName={level.name}
          />
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Les trois visages de l'inspecteur                                   */
/* ------------------------------------------------------------------ */

function RoomInspector({
  room,
  readOnly,
  onPatch,
  onDelete,
}: {
  room: PlanRoom;
  readOnly: boolean;
  onPatch: (patch: Partial<PlanRoom>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Places");

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-nexus-primary">
        {t("Admin.roomTitle")}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="room-name">{t("Admin.roomName")}</Label>
        <Input
          id="room-name"
          value={room.name}
          disabled={readOnly}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="room-kind">{t("Admin.roomKind")}</Label>
        <select
          id="room-kind"
          value={room.kind}
          disabled={readOnly}
          onChange={(event) =>
            onPatch({ kind: event.target.value as RoomKind })
          }
          className="h-9 w-full rounded-md border border-input bg-input/30 px-2 text-sm"
        >
          {ROOM_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`Admin.roomKinds.${kind}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>{t("Admin.roomFill")}</Label>
        <div className="flex gap-1.5">
          {ROOM_FILLS.map((fill) => {
            const paint = fillStyle(fill);
            return (
              <button
                key={fill}
                type="button"
                aria-label={t(`Admin.roomFills.${fill}`)}
                title={t(`Admin.roomFills.${fill}`)}
                aria-pressed={room.fill === fill}
                disabled={readOnly}
                onClick={() => onPatch({ fill })}
                className={`size-7 rounded-md border-2 ${room.fill === fill ? "ring-2 ring-ring" : ""}`}
                style={{
                  background: paint.background,
                  borderColor: paint.border,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("Admin.roomSize")}</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {(["x", "y", "w", "h"] as const).map((axis) => (
            <label key={axis} className="block">
              <span className="sr-only">{axis}</span>
              <Input
                inputMode="decimal"
                disabled={readOnly}
                className="h-8 px-1.5 text-center font-mono text-[11px]"
                value={metres(room[axis])}
                onChange={(event) => {
                  const parsed = Number(event.target.value.replace(",", "."));
                  if (Number.isFinite(parsed)) {
                    onPatch({
                      [axis]: Math.round(parsed * 100),
                    } as Partial<PlanRoom>);
                  }
                }}
              />
            </label>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t("Admin.roomSizeHint")}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("Admin.orientation")}</Label>
        <div className="grid grid-cols-[auto_1fr_auto] gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => onPatch({ rot: wrapDegrees(room.rot - SNAP_DEG) })}
          >
            −{SNAP_DEG}°
          </Button>
          <div className="flex h-8 items-center justify-center rounded-md border border-input bg-input/30 font-mono text-xs">
            {room.rot}°
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => onPatch({ rot: wrapDegrees(room.rot + SNAP_DEG) })}
          >
            +{SNAP_DEG}°
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {[0, 15, 30, 45, 90].map((angle) => (
            <button
              key={angle}
              type="button"
              disabled={readOnly}
              onClick={() => onPatch({ rot: angle })}
              className={`h-6 rounded border px-2 text-[11px] ${room.rot === angle ? "border-[#9ED0FF]/45 bg-white/10 text-foreground" : "border-[#9ED0FF]/15 text-muted-foreground"}`}
            >
              {angle}°
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t("Admin.orientationHint")}
        </p>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>{t("Admin.roomLabelShown")}</span>
        <input
          type="checkbox"
          checked={room.label}
          disabled={readOnly}
          onChange={(event) => onPatch({ label: event.target.checked })}
          className="size-4 accent-[#C2E2FF]"
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>{t("Admin.roomStair")}</span>
        <select
          value={room.stair ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            onPatch({
              stair: (event.target.value || undefined) as PlanRoom["stair"],
            })
          }
          className="h-8 rounded-md border border-input bg-input/30 px-2 text-sm"
        >
          <option value="">{t("Admin.roomStairNone")}</option>
          <option value="up">{t("Admin.roomStairUp")}</option>
          <option value="down">{t("Admin.roomStairDown")}</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="room-note">{t("Admin.roomNote")}</Label>
        <Input
          id="room-note"
          value={room.note ?? ""}
          disabled={readOnly}
          onChange={(event) => onPatch({ note: event.target.value })}
        />
      </div>

      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-red-400"
          onClick={onDelete}
        >
          <TrashIcon className="size-4" />
          {t("Admin.roomDelete")}
        </Button>
      )}
    </div>
  );
}

function MarkerInspector({
  marker,
  readOnly,
  onPatch,
  onDelete,
}: {
  marker: PlacePlanMarker;
  readOnly: boolean;
  onPatch: (patch: Partial<PlacePlanMarker>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Places");
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-nexus-primary">
        {t("Admin.markerTitle")}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="marker-label">{t("Admin.markerLabel")}</Label>
        <Input
          id="marker-label"
          value={marker.label ?? ""}
          disabled={readOnly}
          onChange={(event) => onPatch({ label: event.target.value })}
        />
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">
        {marker.x.toFixed(3)} · {marker.y.toFixed(3)}
      </p>
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-red-400"
          onClick={onDelete}
        >
          <TrashIcon className="size-4" />
          {t("Admin.markerDelete")}
        </Button>
      )}
    </div>
  );
}

function PlanInspector({
  plan,
  levelName,
  readOnly,
  onPatch,
  onRenameLevel,
}: {
  plan: DrawnPlacePlan;
  levelName: string;
  readOnly: boolean;
  onPatch: (patch: Partial<DrawnPlacePlan>) => void;
  onRenameLevel: (name: string) => void;
}) {
  const t = useTranslations("Places");
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-nexus-primary">
        {t("Admin.planSettings")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("Admin.nothingSelected")}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="level-name">{t("Admin.levelName")}</Label>
        <Input
          id="level-name"
          value={levelName}
          disabled={readOnly}
          onChange={(event) => onRenameLevel(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("Admin.planExtent")}</Label>
        <div className="grid grid-cols-2 gap-1.5">
          <Input
            inputMode="decimal"
            disabled={readOnly}
            className="h-8 text-center font-mono text-[11px]"
            value={metres(plan.widthCm)}
            onChange={(event) => {
              const parsed = Number(event.target.value.replace(",", "."));
              if (Number.isFinite(parsed) && parsed > 0) {
                onPatch({ widthCm: Math.round(parsed * 100) });
              }
            }}
          />
          <Input
            inputMode="decimal"
            disabled={readOnly}
            className="h-8 text-center font-mono text-[11px]"
            value={metres(plan.heightCm)}
            onChange={(event) => {
              const parsed = Number(event.target.value.replace(",", "."));
              if (Number.isFinite(parsed) && parsed > 0) {
                onPatch({ heightCm: Math.round(parsed * 100) });
              }
            }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t("Admin.planExtentHint")}
        </p>
      </div>
    </div>
  );
}
